module.exports = class Page {
    open (path) {
        return browser.url(path);
    }

    /**
     * El PDP abre por su cuenta el "Account Portal" de adiClub en un <dialog>
     * modal (~2 s tras cargar, no lo dispara ningún paso del test). Vive en el
     * top layer y deja toda la página "not clickable"; como aparece de forma
     * intermitente, se cierra antes de cada clic.
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
     * Un alert() nativo abierto bloquea todo comando WebDriver posterior, así
     * que hay que cerrarlo antes de seguir. Devuelve su texto, o null si no había.
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

    /** Reintenta porque el modal de adiClub puede colarse entre el waitForClickable y el clic. */
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
