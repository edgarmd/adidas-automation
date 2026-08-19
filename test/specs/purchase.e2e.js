const { expect } = require('@wdio/globals');

const HomePage = require('../pageobjects/home.page');
const ProductsPage = require('../pageobjects/products.page');
const ProductPage = require('../pageobjects/product.page');

const TALLA = 'MX 9';
const POSICION = 4;

// El flujo termina en la selección de talla: el "añadir al carrito" lo bloquea
// el WAF de adidas (403 de Akamai en sesiones automatizadas). ProductPage
// conserva esos métodos listos para cuando se pueda usar.
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
        console.log('Producto seleccionado:', nombreEnListado);
    });

    it('debe validar nombre y precio en el detalle del producto', async () => {
        nombreProducto = await ProductPage.obtenerNombre();
        precioProducto = await ProductPage.obtenerPrecio();

        console.log(`Detalle: ${nombreProducto} - ${precioProducto}`);

        // El h1 del PDP se renderiza en mayúsculas, el listado en capitalizado.
        expect(nombreProducto.toLowerCase()).toEqual(nombreEnListado.toLowerCase());
        expect(precioProducto).toMatch(/^\$[\d,]+$/);
    });

    it(`debe seleccionar una talla disponible (preferida ${TALLA})`, async () => {
        const talla = await ProductPage.seleccionarTalla(TALLA);
        console.log('Talla seleccionada:', talla);

        expect(await ProductPage.tallaSeleccionada()).toEqual(talla);
    });
});
