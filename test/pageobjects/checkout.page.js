const Page = require('./page');

/**
 * Checkout: valida el título de la pantalla "Pagar".
 */
class CheckoutPage extends Page {

    get titulo () {
        return $('[data-auto-id="onepage-page-title"]');
    }

    async obtenerTitulo () {
        await this.titulo.waitForDisplayed({
            timeout: 20000,
            timeoutMsg: 'No se cargó la pantalla de pago'
        });
        return (await this.titulo.getText()).trim();
    }
}

module.exports = new CheckoutPage();
