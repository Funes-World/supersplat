import { Events } from './events';

const EMBED_STYLE_ID = 'funes-embed-style';
const LOAD_PARAM_KEYS = ['load', 'model', 'splat', 'splatUrl'];
const EMBED_FLAG_KEYS = ['funesEmbed', 'embed'];
const DISABLE_EMBED_KEYS = ['showEditor', 'funesShowEditor'];

const HIDDEN_CHROME_SELECTORS = [
    '#app-label',
    '#bottom-toolbar',
    '#right-toolbar',
    '#mode-toggle',
    '#menu',
    '#view-cube-container',
    '#timeline-panel',
    '#data-panel',
    '#scene-panel',
    '#view-panel',
    '#color-panel',
    '#status-bar',
    '#cursor-label'
];

const truthyParam = (value: string | null) => {
    return value !== null && !['', '0', 'false', 'no', 'off'].includes(value.toLowerCase());
};

const isFunesEmbeddedMode = (url: URL) => {
    if (DISABLE_EMBED_KEYS.some(key => truthyParam(url.searchParams.get(key)))) {
        return false;
    }

    if (EMBED_FLAG_KEYS.some(key => truthyParam(url.searchParams.get(key)))) {
        return true;
    }

    return LOAD_PARAM_KEYS.some(key => url.searchParams.has(key));
};

const installEmbedStyle = () => {
    if (document.getElementById(EMBED_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = EMBED_STYLE_ID;
    style.textContent = `
        html.funes-embed-mode,
        html.funes-embed-mode body {
            margin: 0;
            overflow: hidden;
            background: transparent;
        }

        html.funes-embed-mode ${HIDDEN_CHROME_SELECTORS.join(`,
        html.funes-embed-mode `)} {
            display: none !important;
            pointer-events: none !important;
        }

        html.funes-embed-mode #canvas,
        html.funes-embed-mode #canvas-container,
        html.funes-embed-mode #main-container {
            width: 100% !important;
            height: 100% !important;
        }
    `;
    document.head.appendChild(style);
};

const applyFunesEmbedConfig = (events: Events) => {
    document.documentElement.classList.add('funes-embed-mode');
    installEmbedStyle();

    events.fire('grid.setVisible', false);
    events.fire('camera.setOverlay', false);
    events.fire('camera.setBound', false);
};

export { applyFunesEmbedConfig, isFunesEmbeddedMode };
