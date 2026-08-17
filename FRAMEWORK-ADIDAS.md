# WebdriverIO + Page Object Model — adidas.mx (código mínimo de referencia)

Flujo cubierto: home → menú Hombre (hover) → Calzado > Tenis → recorrer la primera fila del
listado → abrir la posición 4 → validar nombre y precio en el detalle → seleccionar talla MX 9.

Este archivo es para **leer y entender**, no para copiar/pegar. La meta es escribirlo tú mismo
después, sin verlo, porque entendiste el patrón — no porque lo memorizaste letra por letra.

La diferencia con el ejercicio de Sauce Demo es el punto interesante: Sauce Demo es un sandbox
hecho para practicar, así que todo funciona. adidas.mx es un sitio real de producción, con CDN,
WAF, iframes de terceros y modales de marketing que se abren solos. Casi todo lo que vas a leer
aquí que no estaba en el otro archivo existe **por algo que rompió el test de verdad**, y cada
caso está anotado con su síntoma. Eso es lo que te preguntarían en una entrevista: no el patrón
POM, sino cómo diagnosticaste un flake.

---

## 0. Comandos

```bash
# Instalar dependencias
npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework \
  @wdio/spec-reporter @wdio/globals webdriverio

# Correr el test
npx wdio run ./wdio.conf.js

# Un solo spec
npx wdio run ./wdio.conf.js --spec ./test/specs/purchase.e2e.js

# Con el package.json de este proyecto ("scripts": { "test": "wdio run ./wdio.conf.js" }):
npm test

# Contra Edge instalado en lugar de Chrome for Testing:
BROWSER=edge npm test
```

Resultado esperado: **4 passing** en ~50 s.

---

## 1. `wdio.conf.js`

Tres cosas de esta config no son "el default de la doc" y conviene que sepas defender por qué:

**`wdio:enforceWebDriverClassic: true`** — es la línea más importante del archivo. WDIO v9 usa
WebDriver BiDi por defecto para buscar elementos (`browsingContext.locateNodes`). Al aceptar
cookies, adidas inyecta iframes de terceros y ese comando deja de responder: cada búsqueda
posterior se cuelga hasta agotar el timeout. Síntoma: los 6 tests morían con un `Error: Timeout`
genérico y la suite tardaba 16 minutos. Con Classic, el mismo recorrido tarda 5 segundos.
Moraleja: cuando *todo* falla con timeouts idénticos, sospecha del transporte, no de tus
selectores.

**`cacheDir`** — WDIO descarga Chrome for Testing en `os.tmpdir()`. macOS purga `/var/folders`
y deja el `.app` a medias; entonces `codesign -v` falla ("code has no resources but signature
indicates they must be present") y todos los procesos hijos de Chrome mueren con `exit_code=5`.
Síntoma: `WebDriverError: tab crashed` en cualquier `browser.url()`, incluso contra
`example.com`. Apuntar la caché a `~/.cache/wdio` lo elimina.

**Perfil persistente (`--user-data-dir`)** — mantiene cookies entre corridas en lugar de arrancar
siempre con un perfil temporal vacío.

```js
const os = require('node:os');
const path = require('node:path');

const NAVEGADOR = process.env.BROWSER || 'chrome';
const PERFIL = path.join(os.homedir(), '.cache', 'wdio', `perfil-e2e-${NAVEGADOR}`);

const ARGS_COMUNES = [
    '--window-size=1600,1000',
    '--disable-blink-features=AutomationControlled',
    `--user-data-dir=${PERFIL}`
];

const CAPABILITIES = {
    chrome: {
        browserName: 'chrome',
        'wdio:enforceWebDriverClassic': true,
        'goog:chromeOptions': { args: ARGS_COMUNES, excludeSwitches: ['enable-automation'] }
    },
    edge: {
        browserName: 'MicrosoftEdge',
        'wdio:enforceWebDriverClassic': true,
        'ms:edgeOptions': { args: ARGS_COMUNES, excludeSwitches: ['enable-automation'] }
    }
};

exports.config = {
    runner: 'local',
    specs: ['./test/specs/**/*.js'],
    maxInstances: 1,
    cacheDir: path.join(os.homedir(), '.cache', 'wdio'),

    capabilities: [CAPABILITIES[NAVEGADOR]],

    logLevel: 'warn',
    baseUrl: 'https://www.adidas.mx',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    framework: 'mocha',
    reporters: [['spec', { realtimeReporting: true }]],

    mochaOpts: { ui: 'bdd', timeout: 180000 },

    before: async () => {
        await browser.setWindowSize(1600, 1000);
    }
};
```

---

## 2. `test/pageobjects/page.js` — clase base

En Sauce Demo la clase base tenía un solo método (`open`). Aquí tiene tres, y los dos nuevos
existen porque el sitio pelea contra el test:

**`cerrarModalesBloqueantes()`** — el PDP de adidas abre **solo** el modal de adiClub ("Inicia
sesión o regístrate") a los ~2 s de cargar. Lo confirmé instrumentando
`HTMLDialogElement.prototype.showModal` para capturar el stack: sale de
`pdp-app > React > showModal`, con `touchpoint=BEHAVIOURAL`. No lo dispara ningún paso del test.
El detalle técnico que importa: es un `<dialog>` **modal**, así que vive en el *top layer* del
navegador y deja toda la página como `not clickable`. Síntoma:
`element ("button…") still not clickable after 10000ms` en un botón perfectamente visible.

**`cerrarAlertaNativa()`** — un `alert()` abierto **bloquea todos los comandos WebDriver
posteriores**, y el driver empieza a responder con el texto del alert. Síntoma desconcertante:
`WebDriverError: Actualiza la página… when running "execute/sync"`. Si ves el texto de la web
dentro de un error de WebDriver, hay un diálogo nativo abierto.

**`clickOn()`** — reintenta porque el modal puede colarse justo entre el `waitForClickable` y el
`click`. Un `clickOn` con reintentos vale más que veinte `browser.pause()` repartidos.

```js
module.exports = class Page {
    open (path) {
        return browser.url(path);
    }

    async cerrarModalesBloqueantes () {
        return browser.execute(() => {
            let cerrados = 0;
            for (const dialogo of document.querySelectorAll('dialog[open]')) {
                const bloqueante = /^(client-)?account-portal/.test(dialogo.id)
                    || /failed to load/i.test(dialogo.innerText || '');
                if (!bloqueante) continue;

                const btnCerrar = dialogo.querySelector('.stripes_v7_gl-modal__close-button button');
                if (btnCerrar) { btnCerrar.click(); } else { dialogo.close(); }
                cerrados++;
            }
            return cerrados;
        });
    }

    async cerrarAlertaNativa () {
        try {
            const texto = await browser.getAlertText();
            await browser.acceptAlert();
            return texto;
        } catch (error) {
            return null;   // no había alert
        }
    }

    async clickOn (element, { intentos = 3 } = {}) {
        await element.waitForDisplayed();
        let ultimoError;

        for (let intento = 1; intento <= intentos; intento++) {
            await this.cerrarAlertaNativa();
            await this.cerrarModalesBloqueantes();
            try {
                await element.scrollIntoView({ block: 'center' });
                await element.waitForClickable({ timeout: 8000 });
                await element.click();
                return;
            } catch (error) {
                ultimoError = error;
            }
        }

        throw ultimoError;
    }

    randomInt (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
```

---

## 3. `test/pageobjects/home.page.js`

Dos patrones nuevos frente a Sauce Demo:

**El flyout se abre con hover, no con clic.** `moveTo()` sobre el botón *Hombre*, y el puntero
tiene que pasar **directo** del botón al link *Tenis*: si se sale del header, el menú se cierra
y el link sigue en el DOM pero deja de ser interactuable. Síntoma:
`Element <a …>Tenis</a> did not become interactable`. Por eso `irATenis()` reintenta reabriendo
el menú, en lugar de asumir que el hover salió bien la primera vez.

**El selector `manual_cm_sp="header-_-hombre-_-calzado-_-tenis"`** es un atributo de analítica.
No es `data-test` (adidas no expone atributos de testing), pero cumple el mismo criterio que
defendías en el otro archivo: describe la *intención* de negocio del elemento (qué ruta del menú
es), no su apariencia, así que sobrevive a los rediseños de CSS. Es el mejor selector disponible
en este sitio.

```js
const Page = require('./page');

class HomePage extends Page {
    get menuHombre () {
        return $('button[data-auto-id="flyout-link"][manual_cm_sp="header-_-hombre"]');
    }
    get cookiesmodal () {
        return $('//h6[contains(normalize-space(text()), "SEGUIMIENTO DE COOKIES")]');
    }
    get btnAllowCookies () {
        return $('//span[normalize-space(text())="Aceptar el seguimiento"]');
    }
    get linkTenis () {
        return $('a[manual_cm_sp="header-_-hombre-_-calzado-_-tenis"]');
    }

    async open () {
        await super.open('/');
        await this.aceptarCookies();
    }

    // Si el modal no aparece (perfil con cookies ya aceptadas), continúa sin fallar.
    async aceptarCookies () {
        const visible = await this.cookiesmodal
            .waitForDisplayed({ timeout: 15000 })
            .then(() => true, () => false);

        if (!visible) return false;

        await this.clickOn(this.btnAllowCookies);
        await this.cookiesmodal.waitForDisplayed({ reverse: true, timeout: 10000 });
        return true;
    }

    async abrirMenuHombre () {
        await browser.execute(() => window.scrollTo(0, 0));
        await this.cerrarModalesBloqueantes();
        await this.menuHombre.waitForDisplayed();
        await this.menuHombre.moveTo();            // hover, no click
        await this.linkTenis.waitForDisplayed({ timeout: 10000 });
    }

    async irATenis ({ intentos = 3 } = {}) {
        let ultimoError;

        for (let intento = 1; intento <= intentos; intento++) {
            try {
                await this.abrirMenuHombre();
                await this.linkTenis.moveTo();
                await this.linkTenis.waitForClickable({ timeout: 5000 });
                await this.linkTenis.click();

                await browser.waitUntil(
                    async () => (await browser.getUrl()).includes('zapatillas_y_tenis-hombre'),
                    { timeout: 20000, timeoutMsg: 'No se navegó al listado de tenis' }
                );
                return;
            } catch (error) {
                ultimoError = error;
                await browser.execute(() => window.scrollTo(0, 400));   // cerrar el flyout
            }
        }

        throw ultimoError;
    }
}

module.exports = new HomePage();
```

---

## 4. `test/pageobjects/products.page.js`

Igual que `firstProduct` en Sauce Demo, aquí nada está atado a un producto concreto: la primera
fila son "las primeras 4 tarjetas", y la posición se pasa como parámetro. El catálogo de adidas
cambia a diario, así que un test atado a un SKU se rompe mañana.

Detalle que sí muerde: `[data-testid="main-price"]` incluye la etiqueta para lectores de
pantalla, así que `getText()` devuelve `"Precio\n$1,999"`. De ahí el `match(/\$[\d,]+/)`.

```js
const Page = require('./page');

class ProductsPage extends Page {
    static get PRODUCTOS_POR_FILA () { return 4; }

    get tarjetas () { return $$('[data-testid="plp-product-card"]'); }

    enlaceImagen (t) { return t.$('a[data-testid="product-card-image-link"]'); }
    titulo (t) { return t.$('[data-testid="product-card-title"]'); }
    precio (t) { return t.$('[data-testid="main-price"]'); }

    async esperarListado () {
        await this.tarjetas[0].waitForDisplayed({ timeout: 30000 });
    }

    async primeraFila () {
        await this.esperarListado();
        const tarjetas = await this.tarjetas;
        return tarjetas.slice(0, ProductsPage.PRODUCTOS_POR_FILA);
    }

    async recorrerPrimeraFila () {
        const fila = await this.primeraFila();
        const productos = [];

        for (const tarjeta of fila) {
            await tarjeta.scrollIntoView({ block: 'center' });
            await tarjeta.moveTo();
            const textoPrecio = (await this.precio(tarjeta).getText()).trim();
            productos.push({
                nombre: (await this.titulo(tarjeta).getText()).trim(),
                precio: textoPrecio.match(/\$[\d,]+/)?.[0] ?? textoPrecio
            });
        }

        return productos;
    }

    async seleccionarProducto (posicion = ProductsPage.PRODUCTOS_POR_FILA) {
        const fila = await this.primeraFila();
        const tarjeta = fila[posicion - 1];

        if (!tarjeta) throw new Error(`No existe la posición ${posicion} en la primera fila`);

        await tarjeta.scrollIntoView({ block: 'center' });
        await tarjeta.moveTo();
        const nombre = (await this.titulo(tarjeta).getText()).trim();
        await this.clickOn(this.enlaceImagen(tarjeta));

        return nombre;
    }
}

module.exports = new ProductsPage();
```

---

## 5. `test/pageobjects/product.page.js`

**Aquí está el bug más instructivo de todo el ejercicio.** La versión original hacía:

```js
get tallasDisponibles () {
    return this.selectorTallas.$$('button:not([disabled])');   // ❌
}
```

Parece razonable y es falso: en adidas las tallas agotadas **no llevan el atributo `disabled`**.
Se marcan con una clase (`…size--unavailable…`) y con el aria-label *"La talla MX 2 no está
disponible en este momento"*. Así que ese selector daba por disponibles **las 25 tallas** y el
test hacía clic en una agotada — con lo que el add-to-cart fallaba después, lejos de la causa
real.

Las disponibles son las que llevan `aria-label="Talla: MX 9"`. Por eso el filtro es
`button[aria-label^="Talla:"]`. Dos lecciones:

1. `:not([disabled])` asume una convención de accesibilidad que el sitio no cumple. **Verifica
   el DOM real** antes de confiar en el atributo semántico "obvio".
2. No te fíes de la clase (`size--unavailable__2jok4`): el sufijo es un hash de build y cambia
   en cada deploy. El `aria-label` es contenido, y es estable.

Y `tallaSeleccionada()` aplica el mismo principio de forma positiva: en vez de dar por hecho que
el clic funcionó, comprueba que la talla quedó con `aria-checked="true"`. Aserción sobre el
estado resultante, no sobre la acción.

```js
const Page = require('./page');

class ProductPage extends Page {
    get nombre () { return $('h1'); }
    get precios () { return $$('[data-testid="main-price"]'); }
    get selectorTallas () { return $('[data-auto-id="size-selector"]'); }

    // Las agotadas NO llevan disabled: se filtran por aria-label.
    get tallasDisponibles () {
        return this.selectorTallas.$$('button[aria-label^="Talla:"]:not([disabled])');
    }

    async esperarCarga () {
        await this.nombre.waitForDisplayed({ timeout: 15000 });
    }

    async obtenerNombre () {
        await this.esperarCarga();
        return (await this.nombre.getText()).trim();
    }

    // Los nodos de precio se montan vacíos y sólo uno acaba con importe.
    async obtenerPrecio () {
        let importe = '';

        await browser.waitUntil(async () => {
            for (const nodo of await this.precios) {
                const encontrado = (await nodo.getText()).match(/\$[\d,]+/);
                if (encontrado) { importe = encontrado[0]; return true; }
            }
            return false;
        }, { timeout: 20000, timeoutMsg: 'No se mostró el precio' });

        return importe;
    }

    // Usa la talla preferida si está; si no, la primera en stock.
    async seleccionarTalla (preferida = 'MX 9') {
        await this.selectorTallas.waitForDisplayed({ timeout: 20000 });
        await this.selectorTallas.scrollIntoView({ block: 'center' });

        let elegida = null;

        for (const boton of await this.tallasDisponibles) {
            const texto = (await boton.getText()).trim();
            if (!texto) continue;
            if (!elegida) elegida = { boton, texto };
            if (texto === preferida) { elegida = { boton, texto }; break; }
        }

        if (!elegida) throw new Error('El producto no tiene tallas disponibles');

        await this.clickOn(elegida.boton);
        return elegida.texto;
    }

    async tallaSeleccionada () {
        const boton = this.selectorTallas.$('button[aria-checked="true"]');
        await boton.waitForExist({ timeout: 10000, timeoutMsg: 'Ninguna talla quedó seleccionada' });
        return (await boton.getText()).trim();
    }
}

module.exports = new ProductPage();
```

---

## 6. `test/specs/purchase.e2e.js` — el test

Un `it` por paso del flujo, con estado compartido en variables del `describe`. Es un
**escenario encadenado**: el `it` 2 depende de que el 1 dejara el navegador en el listado. Sirve
para demos y para reflejar un recorrido de usuario, pero debes saber decir en voz alta lo que
sacrifica: los tests no son independientes, no se pueden correr en paralelo ni en orden
aleatorio, y si el paso 1 falla los demás caen en cascada. La alternativa (cada `it`
autocontenido, navegando por URL directa) es más robusta pero ya no prueba la navegación.

Nota el `nombreProducto.toLowerCase()`: el `h1` del PDP se renderiza en mayúsculas por CSS y el
listado en capitalizado, así que comparar en crudo falla por un detalle de presentación.

```js
const { expect } = require('@wdio/globals');

const HomePage = require('../pageobjects/home.page');
const ProductsPage = require('../pageobjects/products.page');
const ProductPage = require('../pageobjects/product.page');

const TALLA = 'MX 9';
const POSICION = 4;

describe('adidas.mx - Flujo de compra Hombre > Calzado > Tenis', () => {
    let nombreEnListado;
    let nombreProducto;
    let precioProducto;

    it('debe navegar de Hombre a Tenis', async () => {
        await HomePage.open();
        await HomePage.irATenis();
        await expect(browser).toHaveUrl(expect.stringContaining('zapatillas_y_tenis-hombre'));
    });

    it('debe recorrer la primera fila y seleccionar la posición 4', async () => {
        const fila = await ProductsPage.recorrerPrimeraFila();
        expect(fila).toHaveLength(4);
        console.log('Primera fila de tenis:', fila);

        nombreEnListado = await ProductsPage.seleccionarProducto(POSICION);
    });

    it('debe validar nombre y precio en el detalle del producto', async () => {
        nombreProducto = await ProductPage.obtenerNombre();
        precioProducto = await ProductPage.obtenerPrecio();

        expect(nombreProducto.toLowerCase()).toEqual(nombreEnListado.toLowerCase());
        expect(precioProducto).toMatch(/^\$[\d,]+$/);
    });

    it(`debe seleccionar una talla disponible (preferida ${TALLA})`, async () => {
        const talla = await ProductPage.seleccionarTalla(TALLA);
        expect(await ProductPage.tallaSeleccionada()).toEqual(talla);
    });
});
```

---

## 7. Por qué el flujo termina en la talla (y no en el checkout)

El paso siguiente, "añadir al carrito", **no se puede automatizar contra producción**, y el
motivo es la parte más valiosa que llevarte de este ejercicio.

Al hacer clic en *Añadir al carrito*, la web muestra: *"Actualiza la página, cambia a otro
dispositivo o navegador o vuelve a intentarlo más tarde."* Ese mensaje es un síntoma; la causa
está en la red. Leyendo el performance log de chromedriver:

```
POST https://www.adidas.mx/api/bridge/baskets/-/items
     [{"productId":"KK2010_670","displaySize":"MX 9","specialLaunchProduct":false,"quantity":1}]
  →  403   (text/html)
```

Y el cuerpo de ese 403 es la página clásica de **Akamai Bot Manager**:

```
Access Denied — You don't have permission to access
"/api/bridge/baskets/-/items" on this server.
Reference #18.4c1bd517…   errors.edgesuite.net
```

El dato que lo cierra: la cookie `_abck` trae el segmento **`~-1~`**, que es la marca de Akamai
para "sesión clasificada como bot" (una sesión validada lleva `~0~`). Navegar y leer da 200; sólo
se bloquea la **escritura** al carrito.

Dos conclusiones que conviene tener claras:

- **El modal de adiClub no era la causa.** Costaba trabajo verlo porque los dos aparecían juntos,
  pero el mismo WAF devuelve 403 al iframe del Account Portal (`/ap/mf`), y de ahí que a veces
  el modal salga como *"Failed to load Account Portal"*. El modal y el aviso del carrito son
  **dos síntomas del mismo bloqueo**, no causa y efecto. Confundir correlación con causalidad es
  el error más común diagnosticando flakes.
- **Es intermitente.** Con un perfil persistente el veredicto de Akamai a veces cambia y el
  add-to-cart pasa (de ahí el modal *"Producto añadido al carrito"* que llegué a ver). No es
  determinista, así que como test no sirve: un test que pasa el 30% de las veces es peor que no
  tenerlo.

Forzar ese paso significaría saltarse la protección anti-bot del sitio, así que la respuesta
correcta de ingeniería no es "hacerlo pasar", es reconocer el límite. En un trabajo real las
salidas serían: pedir un entorno de staging sin WAF, pedir que allowlisten la IP o un header de
la suite de CI, o mockear la API del carrito. Y eso es exactamente lo que dirías en una
entrevista si te preguntan hasta dónde llega tu automatización — que el add-to-cart lo bloquea
Akamai en producción vale más que un test verde que no sabes por qué pasa.

Los page objects de carrito y checkout (`cart.page.js`, `checkout.page.js`) siguen en el repo,
con sus métodos escritos, pero **sus selectores no están verificados contra el DOM real** porque
el flujo nunca llega a esas pantallas. Trátalos como borrador, no como referencia: el bug de
`:not([disabled])` de la sección 5 estaba justo en un selector que parecía correcto.

---

## 8. Cómo depurar un flake así (el método, que es lo transferible)

El orden importa: de lo más barato y general a lo más específico.

1. **Mira el patrón, no el primer error.** Seis tests fallando con el mismo `Error: Timeout`
   genérico no son seis bugs: es uno, y está por debajo de tus selectores (transporte, driver,
   navegador). Un solo test fallando con un mensaje concreto sí es un bug de tu código.
2. **Aísla fuera de la suite.** Un script suelto con `remote()` de webdriverio, que haga una cosa
   por línea y mida cuánto tarda cada una, te dice en 20 segundos qué primitiva se cuelga. Correr
   la suite completa para depurar es carísimo.
3. **Pregúntale al DOM, no al selector.** `browser.execute()` con `querySelectorAll` y
   `getComputedStyle` te enseña la verdad: si el botón existe, si está visible, y con
   `document.elementFromPoint(x, y)` **qué elemento está tapándolo**. Así encontré el `<dialog>`
   del top layer.
4. **Instrumenta la API del navegador para saber quién dispara qué.** Parchear
   `HTMLDialogElement.prototype.showModal` para volcar `new Error().stack` fue lo que probó que
   el modal lo abría adidas y no el test. Sirve igual con `fetch`, `XMLHttpRequest` o
   `addEventListener`.
5. **Baja a la red.** `'goog:loggingPrefs': { performance: 'ALL' }` + `browser.getLogs('performance')`
   te da URL, método y **status code** de cada petición. Un mensaje de error en pantalla es una
   opinión de la UI; un 403 es un hecho.
6. **Distingue "mi test está mal" de "el entorno está mal".** El `tab crashed` no era del test:
   era un `.app` de Chrome corrupto. Comprobarlo contra `example.com` costó 10 segundos y
   descartó todo el proyecto como sospechoso.

---

## Orden sugerido para practicar

1. Lee todo el archivo una vez, de corrido, sin escribir nada.
2. Ciérralo. Escribe `page.js` de memoria — pero sólo `open()` y `clickOn()` sin reintentos. Corre
   el test y observa cómo falla en el PDP por el modal. **Entender el fallo primero** vale más que
   escribir la versión blindada de golpe.
3. Añade `cerrarModalesBloqueantes()` y los reintentos. Vuelve a correr.
4. Escribe `home.page.js` de memoria. El hover del flyout es la parte que se te va a olvidar.
5. Sigue con `products.page.js` y `product.page.js`. En este último, escribe primero
   `button:not([disabled])` a propósito y comprueba en el navegador (DevTools, buscando
   `size-selector`) por qué está mal. Corrígelo después.
6. Por último el spec, encadenando los tres page objects.
7. `npm test` cada vez que termines un archivo.

Ejercicio extra, el más parecido a un problema real: quítale el `wdio:enforceWebDriverClassic`
a la config y corre la suite. Vas a ver el cuelgue de 16 minutos con timeouts genéricos. Ahora
diagnostícalo desde cero, sin releer la sección 1.
