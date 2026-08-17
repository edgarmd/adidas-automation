const Page = require('./page');

/**
 * Home de adidas.mx: menú principal (Hombre) y navegación a Calzado > Tenis.
 */
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

    /**
     * El modal de seguimiento de cookies aparece al entrar por primera vez y
     * bloquea el header con su overlay. Si no aparece, continúa sin fallar.
     */
    async aceptarCookies () {
        const modalVisible = await this.cookiesmodal.waitForDisplayed({
            timeout: 15000,
            reverse: false
        }).then(() => true, () => false);

        if (!modalVisible) {
            return false;
        }

        await this.clickOn(this.btnAllowCookies);
        await this.cookiesmodal.waitForDisplayed({
            reverse: true,
            timeout: 10000,
            timeoutMsg: 'El modal de cookies no se cerró'
        });

        return true;
    }

    async abrirMenuHombre () {
        // El header vive arriba: sin esto el hover puede quedar fuera de pantalla.
        await browser.execute(() => window.scrollTo(0, 0));
        // El hover y el clic del flyout no pasan por clickOn: hay que limpiar
        // aquí el diálogo del Account Portal si se abrió.
        await this.cerrarModalesBloqueantes();
        await this.menuHombre.waitForDisplayed();
        // El flyout se despliega con hover, no con clic.
        await this.menuHombre.moveTo();
        await this.linkTenis.waitForDisplayed({
            timeout: 10000,
            timeoutMsg: 'No se desplegó el menú Hombre'
        });
    }

    /**
     * El flyout se cierra en cuanto el puntero sale del header, así que el
     * puntero pasa directo del botón al link (sin scroll intermedio). Si el
     * puntero se escapa, el link sigue en el DOM pero deja de ser interactuable,
     * así que se reabre el menú y se reintenta.
     */
    async irATenis ({ intentos = 3 } = {}) {
        let ultimoError;

        for (let intento = 1; intento <= intentos; intento++) {
            try {
                await this.abrirMenuHombre();
                await this.linkTenis.moveTo();
                await this.linkTenis.waitForClickable({
                    timeout: 5000,
                    timeoutMsg: 'El link Tenis no llegó a ser clickeable'
                });
                await this.linkTenis.click();

                await browser.waitUntil(
                    async () => (await browser.getUrl()).includes('zapatillas_y_tenis-hombre'),
                    {
                        timeout: 20000,
                        timeoutMsg: 'No se navegó al listado de tenis de hombre'
                    }
                );

                return;
            } catch (error) {
                ultimoError = error;
                // Sacar el puntero del header para que el flyout se cierre del todo
                // antes de volver a abrirlo.
                await browser.execute(() => window.scrollTo(0, 400));
            }
        }

        throw ultimoError;
    }
}

module.exports = new HomePage();
