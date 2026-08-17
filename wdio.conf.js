const os = require('node:os');
const path = require('node:path');

// BROWSER=edge usa el Edge instalado (navegador real de consumo) con un perfil
// persistente propio, en lugar del Chrome for Testing con perfil temporal.
// El add-to-cart de adidas lo bloquea Akamai Bot Manager (403 en
// POST /api/bridge/baskets/-/items) en sesiones que clasifica como bot, y un
// perfil que persiste cookies entre corridas es lo único que puede cambiar ese
// veredicto sin falsear la huella del navegador.
const NAVEGADOR = process.env.BROWSER || 'chrome';

// Perfil persistente y dedicado: no se toca el perfil personal del usuario.
const PERFIL = path.join(os.homedir(), '.cache', 'wdio', `perfil-e2e-${NAVEGADOR}`);

const ARGS_COMUNES = [
    '--window-size=1600,1000',
    '--disable-blink-features=AutomationControlled',
    `--user-data-dir=${PERFIL}`
];

// El flujo corre siempre con WebDriver Classic: al aceptar cookies adidas
// inyecta iframes de terceros y BiDi (browsingContext.locateNodes) se queda
// colgado, con lo que todo lookup posterior agota el timeout.
const CAPABILITIES = {
    chrome: {
        browserName: 'chrome',
        'wdio:enforceWebDriverClassic': true,
        'goog:chromeOptions': {
            args: ARGS_COMUNES,
            excludeSwitches: ['enable-automation']
        }
    },
    edge: {
        browserName: 'MicrosoftEdge',
        'wdio:enforceWebDriverClassic': true,
        'ms:edgeOptions': {
            args: ARGS_COMUNES,
            excludeSwitches: ['enable-automation']
        }
    }
};

if (!CAPABILITIES[NAVEGADOR]) {
    throw new Error(`BROWSER="${NAVEGADOR}" no soportado. Usa: ${Object.keys(CAPABILITIES).join(', ')}`);
}

exports.config = {
    runner: 'local',
    specs: ['./test/specs/**/*.js'],
    maxInstances: 1,

    // Por defecto WDIO descarga Chrome/chromedriver en os.tmpdir(). macOS purga
    // /var/folders y deja el .app a medias: los procesos hijos de Chrome mueren
    // con exit_code=5 ("tab crashed") porque la firma del bundle ya no cuadra.
    // Con una caché estable el navegador sobrevive entre sesiones.
    cacheDir: path.join(os.homedir(), '.cache', 'wdio'),

    capabilities: [CAPABILITIES[NAVEGADOR]],

    logLevel: 'warn',
    baseUrl: 'https://www.adidas.mx',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    framework: 'mocha',
    reporters: [['spec', { realtimeReporting: true }]],

    mochaOpts: {
        ui: 'bdd',
        timeout: 180000
    },

    before: async () => {
        await browser.setWindowSize(1600, 1000);
    }
};
