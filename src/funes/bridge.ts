import { Events } from '../events';

import { capabilities, integrationVersion, protocolVersion, runtimeVersion } from './adapter-v3';

const allowedTools = new Set(['move', 'rotate', 'scale', 'rectSelection', 'lassoSelection',
    'polygonSelection', 'brushSelection', 'floodSelection', 'eyedropperSelection',
    'sphereSelection', 'boxSelection', 'measure', 'sphereBrushSelection', 'orient']);

const resolveParentOrigin = (url: URL, referrer: string) => {
    const explicit = url.searchParams.get('funesParentOrigin') ?? url.searchParams.get('embedOrigin');
    if (explicit !== null) {
        try {
            const parsed = new URL(explicit);
            if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin === explicit) return explicit;
        } catch { /* An invalid explicit origin must never broaden access. */ }
        return null;
    }
    try { return referrer ? new URL(referrer).origin : url.origin; } catch { return null; }
};

const registerBridge = (events: Events, url: URL) => {
    const origin = resolveParentOrigin(url, document.referrer);
    const diagnostics = url.searchParams.has('funesDiagnostics') &&
        !['', '0', 'false', 'no', 'off'].includes(url.searchParams.get('funesDiagnostics').toLowerCase());
    let disposed = false;
    let controlsReady = false;
    let pendingOrbit: boolean;
    let pendingTool: { tool: string; enable?: boolean };
    let getGraphics: () => object = () => ({ requestedBackend: 'webgpu', actualBackend: null, webglFallback: false });
    const post = (message: object) => {
        if (disposed || !origin || window.parent === window) return;
        try { window.parent.postMessage(message, origin); } catch { /* Teardown race. */ }
    };
    const toolState = () => post({ type: 'supersplat:tool-state', activeTool: events.invoke('tool.active') ?? null });
    const loading = (value: boolean) => post({ type: 'supersplat:loading', loading: value });
    const error = (failure: unknown, filename?: string) => {
        post({ type: 'supersplat:error', filename,
            message: failure instanceof Error ? failure.message : String(failure), ...getGraphics() });
        loading(false);
    };
    const graphics = () => {
        if (diagnostics) post({ type: 'supersplat:graphics-state', ...getGraphics() });
    };
    const applyOrbit = (enabled: boolean) => {
        events.fire('autoOrbit.set', enabled);
        post({ type: 'supersplat:auto-orbit', result: enabled });
    };
    const applyTool = (data: { tool: string; enable?: boolean }) => {
        events.fire(data.enable === false ? 'tool.deactivate' : `tool.${data.tool}`);
        toolState();
    };
    const onMessage = (event: MessageEvent) => {
        if (disposed || !origin || event.source !== window.parent || event.origin !== origin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'funes:hello') {
            if (data.protocolVersion !== protocolVersion || typeof data.requestId !== 'string' ||
                !data.requestId || data.requestId.length > 128) return;
            post({ type: 'funes:hello:result', requestId: data.requestId,
                protocolVersion, runtimeKind: 'editor', runtimeVersion, integrationVersion,
                graphicsBackend: 'webgpu', capabilities });
        } else if (data.type === 'supersplat:is-scene-dirty') {
            post({ type: data.type, result: controlsReady && events.invoke('scene.dirty') === true });
        } else if (data.type === 'supersplat:graphics-state') {
            graphics();
        } else if (data.type === 'supersplat:auto-orbit' && typeof data.enabled === 'boolean') {
            if (controlsReady) applyOrbit(data.enabled);
            else pendingOrbit = data.enabled;
        } else if (data.type === 'supersplat:tool' && allowedTools.has(data.tool)) {
            if (controlsReady) applyTool(data);
            else pendingTool = { tool: data.tool, enable: data.enable };
        }
    };

    let pendingFrame = false;
    let readyElapsedMs: number;
    const startedAt = performance.now();
    let sampleStart = startedAt;
    let previousFrame: number;
    let frames = 0;
    let frameTotal = 0;
    let frameMax = 0;
    const elementAdded = (element: { type?: string }) => {
        if (element?.type === 'splat') pendingFrame = true;
    };
    const postrender = () => {
        const now = performance.now();
        if (previousFrame !== undefined) {
            const elapsed = now - previousFrame;
            frames++;
            frameTotal += elapsed;
            frameMax = Math.max(frameMax, elapsed);
        }
        previousFrame = now;
        if (pendingFrame) {
            pendingFrame = false;
            readyElapsedMs = now - startedAt;
            loading(false);
            graphics();
        }
        if (diagnostics && now - sampleStart >= 2000 && frames > 0) {
            const round = (n: number) => Math.round(n * 10) / 10;
            post({ type: 'supersplat:performance', readyElapsedMs: readyElapsedMs === undefined ? undefined : round(readyElapsedMs),
                fps: round(1000 / (frameTotal / frames)), averageFrameMs: round(frameTotal / frames),
                maxFrameMs: round(frameMax), frameCount: frames, ...getGraphics() });
            sampleStart = now;
            frames = 0;
            frameTotal = 0;
            frameMax = 0;
        }
    };
    const onError = (event: ErrorEvent) => error(event.error || event.message);
    const onRejection = (event: PromiseRejectionEvent) => error(event.reason);
    window.addEventListener('message', onMessage);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    events.on('tool.activated', toolState);
    events.on('tool.deactivated', toolState);
    events.on('scene.elementAdded', elementAdded);
    events.on('postrender', postrender);

    return {
        loading, error,
        connectControls() {
            controlsReady = true;
            if (pendingOrbit !== undefined) applyOrbit(pendingOrbit);
            if (pendingTool) applyTool(pendingTool);
            pendingOrbit = undefined;
            pendingTool = undefined;
        },
        setGraphics(getter: () => object) { getGraphics = getter; graphics(); },
        dispose() {
            disposed = true;
            window.removeEventListener('message', onMessage);
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
            events.off('tool.activated', toolState);
            events.off('tool.deactivated', toolState);
            events.off('scene.elementAdded', elementAdded);
            events.off('postrender', postrender);
        }
    };
};

export { registerBridge, resolveParentOrigin };
