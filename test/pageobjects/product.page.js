const Page = require('./page');

class ProductPage extends Page {

    get nombre () {
        return $('h1');
    }

    /** La plantilla monta varios nodos de precio y sólo uno acaba con importe. */
    get precios () {
        return $$('[data-testid="main-price"]');
    }

    get selectorTallas () {
        return $('[data-auto-id="size-selector"]');
    }

    /**
     * Las tallas agotadas NO llevan `disabled`: se marcan con clase
     * `...size--unavailable...` y aria-label "La talla X no está disponible...".
     * El filtro fiable son las que empiezan por "Talla:".
     */
    get tallasDisponibles () {
        return this.selectorTallas.$$('button[aria-label^="Talla:"]:not([disabled])');
    }

    /** Hay otro botón "IR A AGREGAR AL CARRITO" que sólo hace scroll. */
    get btnAnadirAlCarrito () {
        return $('button[data-auto-id="add-to-bag"]');
    }

    get modalTitulo () {
        return $('[data-auto-id="added-to-bag-modal-title"]');
    }

    get avisoErrorCarrito () {
        return $('[data-auto-id="cart-error-message"]');
    }

    get modalNombreProducto () {
        return $('[data-auto-id="bag-modal-product-name"]');
    }

    get btnVerCarrito () {
        return $('//span[normalize-space(text())="Ver carrito"]');
    }

    async esperarCarga () {
        await this.nombre.waitForDisplayed({
            timeout: 15000,
            timeoutMsg: 'No se cargó el detalle del producto'
        });
    }

    async obtenerNombre () {
        await this.esperarCarga();
        return (await this.nombre.getText()).trim();
    }

    /** Los nodos de precio se montan vacíos: devuelve el primero con importe. */
    async obtenerPrecio () {
        let importe = '';

        await browser.waitUntil(async () => {
            for (const nodo of await this.precios) {
                const encontrado = (await nodo.getText()).match(/\$[\d,]+/);
                if (encontrado) {
                    importe = encontrado[0];
                    return true;
                }
            }
            return false;
        }, {
            timeout: 20000,
            timeoutMsg: 'No se mostró el precio del producto'
        });

        return importe;
    }

    /**
     * Cae a la primera talla en stock si la preferida no está (p. ej. un modelo
     * infantil sin MX 9). Devuelve la talla realmente seleccionada.
     */
    async seleccionarTalla (preferida = 'MX 9') {
        await this.selectorTallas.waitForDisplayed({
            timeout: 20000,
            timeoutMsg: 'No se cargó el selector de tallas'
        });
        await this.selectorTallas.scrollIntoView({ block: 'center' });

        let elegida = null;

        for (const boton of await this.tallasDisponibles) {
            const texto = (await boton.getText()).trim();
            if (!texto) continue;
            if (!elegida) elegida = { boton, texto };
            if (texto === preferida) {
                elegida = { boton, texto };
                break;
            }
        }

        if (!elegida) {
            throw new Error('El producto no tiene tallas disponibles');
        }

        await this.clickOn(elegida.boton);
        return elegida.texto;
    }

    /** El aria-checked confirma que el clic surtió efecto, no sólo que se hizo. */
    async tallaSeleccionada () {
        const boton = this.selectorTallas.$('button[aria-checked="true"]');

        await boton.waitForExist({
            timeout: 10000,
            timeoutMsg: 'Ninguna talla quedó seleccionada'
        });

        return (await boton.getText()).trim();
    }

    /**
     * El 403 de Akamai en POST /api/bridge/baskets/-/items es intermitente y la
     * propia web pide recargar y reintentar, que es lo que se hace aquí.
     * `talla` es necesaria porque la recarga borra la selección.
     */
    async anadirAlCarrito ({ talla = null, intentos = 4 } = {}) {
        let ultimoError = null;

        for (let intento = 1; intento <= intentos; intento++) {
            if (intento > 1) {
                await browser.refresh();
                await this.esperarCarga();
                if (talla) {
                    await this.seleccionarTalla(talla);
                }
            }

            await this.clickOn(this.btnAnadirAlCarrito);

            const resultado = await this.esperarRespuestaDelCarrito();

            if (resultado.ok) {
                if (intento > 1) {
                    console.log(`Añadido al carrito en el intento ${intento} (los previos los rechazó el WAF)`);
                }
                return;
            }

            ultimoError = resultado.error;
            await browser.pause(2000);
        }

        throw new Error(
            `adidas rechazó el "añadir al carrito" en ${intentos} intentos: "${ultimoError}". `
            + 'El POST /api/bridge/baskets/-/items responde 403 (Akamai Bot Manager: '
            + '"Access Denied", cookie _abck con marca ~-1~): el WAF no validó esta sesión.'
        );
    }

    /**
     * El clic resuelve de tres formas: modal de confirmación, aviso de error
     * sobre el botón, o ese mismo aviso como alert() nativo.
     */
    async esperarRespuestaDelCarrito () {
        let resultado = null;

        await browser.waitUntil(async () => {
            const textoAlerta = await this.cerrarAlertaNativa();
            if (textoAlerta) {
                resultado = { ok: false, error: `${textoAlerta} (alert nativo)` };
                return true;
            }

            if (await this.modalTitulo.isDisplayed().catch(() => false)) {
                resultado = { ok: true };
                return true;
            }

            const error = await this.avisoErrorCarrito.getText().catch(() => '');
            if (error.trim()) {
                resultado = { ok: false, error: error.trim() };
                return true;
            }

            return false;
        }, {
            timeout: 20000,
            timeoutMsg: 'El "añadir al carrito" no dio respuesta: ni modal de confirmación ni aviso de error'
        });

        return resultado;
    }

    async obtenerTituloModal () {
        return (await this.modalTitulo.getText()).trim();
    }

    async obtenerNombreEnModal () {
        await this.modalNombreProducto.waitForDisplayed();
        return (await this.modalNombreProducto.getText()).trim();
    }

    async irAlCarrito () {
        await this.clickOn(this.btnVerCarrito);
    }
}

module.exports = new ProductPage();
