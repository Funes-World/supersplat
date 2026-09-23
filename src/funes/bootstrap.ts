import { Events } from '../events';
import { Scene } from '../scene';

import { createEditorDevice, graphicsState, importTarget, sceneDefaults } from './adapter-v3';
import { AutoOrbitController } from './auto-orbit';
import { registerBridge } from './bridge';
import { applyFunesEmbedConfig, isFunesEmbeddedMode } from './embed-ui';
import { collectImportTargets } from './query-loader';

const createFunesIntegration = (events: Events, url: URL) => {
    const bridge = registerBridge(events, url);
    const embedded = isFunesEmbeddedMode(url);
    let orbit: AutoOrbitController;
    let initMs = 0;
    const dispose = () => {
        orbit?.dispose();
        bridge.dispose();
        window.removeEventListener('pagehide', dispose);
    };
    window.addEventListener('pagehide', dispose);
    return {
        sceneDefaults,
        async createGraphicsDevice(canvas: HTMLCanvasElement) {
            const start = performance.now();
            try {
                const device = await createEditorDevice(canvas, url);
                initMs = performance.now() - start;
                return device;
            } catch (error) {
                bridge.error(error);
                throw error;
            }
        },
        attach(scene: Scene, canvas: HTMLCanvasElement) {
            orbit = new AutoOrbitController(events, scene, { enabled: !embedded });
            events.function('autoOrbit.controller', () => orbit);
            bridge.setGraphics(() => graphicsState(scene, canvas, initMs));
            if (embedded) applyFunesEmbedConfig(events);
            bridge.connectControls();
        },
        async load() {
            const targets = collectImportTargets(url);
            if (!targets.length) return;
            bridge.loading(true);
            for (const target of targets) {
                try { await importTarget(events, target); }
                catch (error) { bridge.error(error, target.filename); throw error; }
            }
        },
        dispose
    };
};

export { createFunesIntegration };
