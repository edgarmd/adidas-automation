const Page = require('./page');

class ProductsPage extends Page {

    /** Productos que componen la primera fila en desktop. */
    static get PRODUCTOS_POR_FILA () {
        return 4;
    }

    get tarjetas () {
        return $$('[data-testid="plp-product-card"]');
    }

    /**
     * Existe sólo en algunas tarjetas y mide 0x0 hasta que el puntero entra:
     * sirve para leer el nombre, nunca para hacer clic.
     */
    imagenHover (tarjeta) {
        return tarjeta.$('[data-testid="product-card-hover-image"]');
    }

    enlaceImagen (tarjeta) {
        return tarjeta.$('a[data-testid="product-card-image-link"]');
    }

    titulo (tarjeta) {
        return tarjeta.$('[data-testid="product-card-title"]');
    }

    precio (tarjeta) {
        return tarjeta.$('[data-testid="main-price"]');
    }

    async esperarListado () {
        await this.tarjetas[0].waitForDisplayed({
            timeout: 30000,
            timeoutMsg: 'No se cargó el listado de tenis'
        });
    }

    async primeraFila () {
        await this.esperarListado();
        const tarjetas = await this.tarjetas;
        return tarjetas.slice(0, ProductsPage.PRODUCTOS_POR_FILA);
    }

    /** Devuelve nombre y precio de cada tenis de la primera fila. */
    async recorrerPrimeraFila () {
        const fila = await this.primeraFila();
        const productos = [];

        for (const tarjeta of fila) {
            await tarjeta.scrollIntoView({ block: 'center' });
            await tarjeta.moveTo();
            // El nodo de precio incluye la etiqueta "Precio" para lectores de
            // pantalla: sólo interesa el importe.
            const textoPrecio = (await this.precio(tarjeta).getText()).trim();

            productos.push({
                nombre: (await this.titulo(tarjeta).getText()).trim(),
                precio: textoPrecio.match(/\$[\d,]+/)?.[0] ?? textoPrecio
            });
        }

        return productos;
    }

    /** `posicion` es 1-based. Devuelve el nombre del producto seleccionado. */
    async seleccionarProducto (posicion = ProductsPage.PRODUCTOS_POR_FILA) {
        const fila = await this.primeraFila();
        const tarjeta = fila[posicion - 1];

        if (!tarjeta) {
            throw new Error(`No existe la posición ${posicion} en la primera fila`);
        }

        await tarjeta.scrollIntoView({ block: 'center' });
        await tarjeta.moveTo();
        const nombre = (await this.titulo(tarjeta).getText()).trim();
        await this.clickOn(this.enlaceImagen(tarjeta));

        return nombre;
    }
}

module.exports = new ProductsPage();
