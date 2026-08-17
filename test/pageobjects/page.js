module.exports = class Page {
    open (path) {
        return browser.url(path);
    }

    /**
     * El PDP de adidas abre por su cuenta el "Account Portal" (adiClub: "Inicia
     * sesión o regístrate") en un <dialog> modal, con touchpoint BEHAVIOURAL y a
     * los ~2 s de cargar. No lo dispara ningún paso del test: la pila de llamadas
     * sale de pdp-app > React > HTMLDialogElement.showModal. Si el iframe no
     * carga, el diálogo se queda con "Failed to load Account Portal".
     *
     * En cualquiera de los dos casos es un <dialog> modal: vive en el top layer y
     * bloquea los clics de toda la página (todo queda "not clickable"). Como
     * aparece de forma intermitente, se cierra antes de cada clic.
     */
    async cerrarModalesBloqueantes () {
        return browser.execute(() => {
            let cerrados = 0;

            for (const dialogo of document.querySelectorAll('dialog[open]')) {
                const bloqueante = /^(client-)?account-portal/.test(dialogo.id)
                    || /failed to load/i.test(dialogo.innerText || '');

                if (!bloqueante) continue;

                const btnCerrar = dialogo.querySelector('.stripes_v7_gl-modal__close-button button');
                if (btnCerrar) {
                    btnCerrar.click();
                } else {
                    dialogo.close();
                }
                cerrados++;
            }

            return cerrados;
        });
    }

    /**
     * El aviso de error del carrito llega unas veces como nodo del DOM y otras
     * como alert() nativo. Un alert abierto bloquea TODO comando WebDriver
     * posterior (el propio driver responde con el texto del alert), así que hay
     * que cerrarlo antes de seguir. Devuelve su texto, o null si no había.
     */
    async cerrarAlertaNativa () {
        try {
            const texto = await browser.getAlertText();
            await browser.acceptAlert();
            return texto;
        } catch (error) {
            return null;
        }
    }

    /**
     * Baja hasta el elemento y espera a que sea clickeable antes de hacer clic.
     * Reintenta porque el diálogo del Account Portal puede colarse justo entre
     * la comprobación y el clic.
     */
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

    /**
     * Devuelve un entero aleatorio entre min y max (ambos incluidos).
     */
    randomInt (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
