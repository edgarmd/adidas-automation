const Page = require('./page');

/**
 * Carrito: cambia la cantidad con una opción aleatoria del dropdown,
 * valida el resumen del pedido y avanza a pagar.
 */
class CartPage extends Page {

    get dropdownCantidad () {
        return $('div[role="combobox"].dropdown-select');
    }

    get etiquetaCantidad () {
        return $('.gl-dropdown-custom__select-label-text');
    }

    get opcionesCantidad () {
        return $$('li.gl-dropdown-custom__option[role="option"]');
    }

    get totalProductos () {
        return $('[data-auto-id="glass-cart-summary-total-items"]');
    }

    get btnIrAPagar () {
        return $('//span[normalize-space(text())="Ir a pagar"]');
    }

    async esperarCarga () {
        await this.dropdownCantidad.waitForDisplayed({
            timeout: 15000,
            timeoutMsg: 'No se cargó el carrito'
        });
    }

    /**
     * Abre el dropdown y elige una cantidad al azar (distinta de la actual).
     * Devuelve la cantidad seleccionada como número.
     */
    async seleccionarCantidadAleatoria () {
        await this.esperarCarga();
        await this.clickOn(this.dropdownCantidad);

        const opciones = await this.opcionesCantidad;
        const actual = (await this.etiquetaCantidad.getText()).trim();

        const candidatas = [];
        for (const opcion of opciones) {
            const valor = (await opcion.getText()).trim();
            if (valor && valor !== actual) {
                candidatas.push({ opcion, valor });
            }
        }

        if (!candidatas.length) {
            throw new Error('El dropdown de cantidad no tiene opciones disponibles');
        }

        const elegida = candidatas[this.randomInt(0, candidatas.length - 1)];
        await this.clickOn(elegida.opcion);

        return Number(elegida.valor);
    }

    /**
     * Devuelve la cantidad de productos del resumen del pedido como número.
     * (Ej.: "3 productos" -> 3)
     */
    async obtenerTotalProductos () {
        await this.totalProductos.waitForDisplayed({
            timeout: 15000,
            timeoutMsg: 'No se mostró el total de productos en el resumen'
        });
        const texto = (await this.totalProductos.getText()).trim();
        return Number(texto.match(/\d+/)?.[0]);
    }

    /**
     * Espera a que el resumen refleje la cantidad esperada.
     */
    async esperarTotalProductos (esperado) {
        await browser.waitUntil(
            async () => (await this.obtenerTotalProductos()) === esperado,
            {
                timeout: 15000,
                timeoutMsg: `El resumen no llegó a ${esperado} productos`
            }
        );
    }

    async irAPagar () {
        await this.clickOn(this.btnIrAPagar);
    }
}

module.exports = new CartPage();
