// All FUNES calls into the pinned Editor 3.3.0 API live in this adapter.
import { createGraphicsDevice } from 'playcanvas';

import { EntityTransformHandler } from '../entity-transform-handler';
import { Events } from '../events';
import { registerPivotEvents } from '../pivot';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { SplatsTransformHandler } from '../splats-transform-handler';

const runtimeVersion = '3.3.0';
const integrationVersion = 1;
const protocolVersion = 1;
const capabilities = Object.freeze({ autoOrbit: true, toolControl: true, graphicsDiagnostics: true, webglFallback: false });

// Params resolves the first matching source. URL overrides retain precedence.
const sceneDefaults = {
    bgClr: '0.73,0.73,0.73,1',
    camera: { fov: 75 },
    controls: { initialAzim: 0, initialElev: 0 }
};

const createEditorDevice = async (canvas: HTMLCanvasElement, url: URL) => {
    const requested = (url.searchParams.get('funesRenderer') ?? 'auto').toLowerCase();
    if (requested === 'webgl' || requested === 'webgl2') {
        throw new Error('SuperSplat Editor 3.3 requires WebGPU. Use the FUNES Viewer for WebGL viewing.');
    }
    const device = await createGraphicsDevice(canvas, {
        deviceTypes: ['webgpu'], antialias: false, depth: false, stencil: false,
        xrCompatible: false, powerPreference: 'high-performance'
    });
    if (device.deviceType !== 'webgpu') {
        device.destroy();
        throw new Error('SuperSplat Editor 3.3 requires a working WebGPU device.');
    }
    return device;
};

const importTarget = async (events: Events, target: { filename: string; url: string }) => {
    // Upstream catches import failures for its popup and returns an empty result.
    const models = await events.invoke('import', [target]);
    if (!Array.isArray(models) || models.length === 0) throw new Error(`Unable to load '${target.filename}'.`);
    return models;
};

const graphicsState = (scene: Scene, canvas: HTMLCanvasElement, initMs: number) => ({
    requestedBackend: 'webgpu', actualBackend: scene.app.graphicsDevice.deviceType,
    deviceTypes: ['webgpu'], webGPUAvailable: !!navigator.gpu,
    graphicsInitMs: Math.round(initMs * 10) / 10,
    devicePixelRatio: window.devicePixelRatio, canvasWidth: canvas.width, canvasHeight: canvas.height,
    webglFallback: false
});

const hasPartialSelection = (splat: Pick<Splat, 'numSelected' | 'numSplats'>) =>
    splat.numSelected > 0 && splat.numSelected < splat.numSplats;

// Mirrors pinned upstream transform-handler.ts. A complete selection moves
// the layer entity, preserving the existing FUNES transform contract.
const registerFunesTransformHandler = (events: Events) => {
    type Handler = { activate: () => void; deactivate: () => void };
    const handlers: Handler[] = [];
    const push = (handler: Handler) => {
        handlers.at(-1)?.deactivate();
        handlers.push(handler);
        handler.activate();
    };
    const pop = () => {
        handlers.pop()?.deactivate();
        handlers.at(-1)?.activate();
    };
    const entity = new EntityTransformHandler(events);
    const selected = new SplatsTransformHandler(events);
    const update = (splat: Splat) => {
        pop();
        if (splat) push(hasPartialSelection(splat) ? selected : entity);
    };
    events.on('selection.changed', update);
    events.on('splat.stateChanged', update);
    events.on('transformHandler.push', push);
    events.on('transformHandler.pop', pop);
    registerPivotEvents(events);
};

export {
    capabilities, createEditorDevice, graphicsState, hasPartialSelection,
    importTarget, integrationVersion, protocolVersion, registerFunesTransformHandler,
    runtimeVersion, sceneDefaults
};
