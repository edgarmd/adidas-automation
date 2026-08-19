const os = require('node:os');
const path = require('node:path');

// adidas bloquea el add-to-cart desde el WAF (403 en POST
// /api/bridge/baskets/-/items) en sesiones que clasifica como bot. BROWSER=edge
// usa el Edge de consumo con perfil persistente: cookies que sobreviven entre
// corridas son la única palanca que cambia ese veredicto sin falsear la huella.
const NAVEGADOR = process.env.BROWSER || 'chrome';

// Perfil dedicado: nunca el personal del usuario.
const PERFIL = path.join(os.homedir(), '.cache', 'wdio', `perfil-e2e-${NAVEGADOR}`);

const ARGS_COMUNES = [
    '--window-size=1600,1000',
    '--disable-blink-features=AutomationControlled',
    `--user-data-dir=${PERFIL}`
];

// WebDriver Classic obligatorio: al aceptar cookies adidas inyecta iframes de
// terceros y BiDi (browsingContext.locateNodes) se cuelga, con lo que todo
// lookup posterior agota el timeout.
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

    // Fuera de os.tmpdir(): macOS purga /var/folders y deja el .app a medias,
    // con lo que los hijos de Chrome mueren con exit_code=5 ("tab crashed").
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
