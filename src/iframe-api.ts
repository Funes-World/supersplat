import { Events } from './events';

const IS_SCENE_DIRTY = 'supersplat:is-scene-dirty';
const SET_AUTO_ORBIT = 'supersplat:auto-orbit';
const TOOL_MESSAGE = 'supersplat:tool';
const TOOL_STATE = 'supersplat:tool-state';
const LOADING_STATE = 'supersplat:loading';
const LOAD_ERROR = 'supersplat:error';
const GRAPHICS_STATE = 'supersplat:graphics-state';
const PERFORMANCE_SAMPLE = 'supersplat:performance';

const ALLOWED_TOOLS = new Set([
    'move',
    'rotate',
    'scale',
    'rectSelection',
    'lassoSelection',
    'polygonSelection',
    'brushSelection',
    'floodSelection',
    'eyedropperSelection',
    'sphereSelection',
    'boxSelection',
    'measure'
]);

interface IsSceneDirtyQuery {
    type: typeof IS_SCENE_DIRTY;
}

interface IsSceneDirtyResponse {
    type: typeof IS_SCENE_DIRTY;
    result: boolean;
}

interface SetAutoOrbitMessage {
    type: typeof SET_AUTO_ORBIT;
    enabled: boolean;
}

interface SetAutoOrbitResponse {
    type: typeof SET_AUTO_ORBIT;
    result: boolean;
}

interface ToolMessage {
    type: typeof TOOL_MESSAGE;
    tool: string;
    enable?: boolean;
}

interface ToolState {
    type: typeof TOOL_STATE;
    activeTool: string | null;
}

interface LoadingStateMessage {
    type: typeof LOADING_STATE;
    loading: boolean;
}

interface LoadErrorMessage {
    type: typeof LOAD_ERROR;
    filename?: string;
    message: string;
}

interface GraphicsStateMessage {
    type: typeof GRAPHICS_STATE;
    requestedBackend?: string;
    actualBackend?: string;
    deviceTypes?: string[];
    webGPUAvailable?: boolean;
    graphicsInitMs?: number;
    devicePixelRatio?: number;
    canvasWidth?: number;
    canvasHeight?: number;
}

interface PerformanceSampleMessage {
    type: typeof PERFORMANCE_SAMPLE;
    readyElapsedMs?: number;
    fps: number;
    averageFrameMs: number;
    maxFrameMs: number;
    frameCount: number;
    canvasWidth?: number;
    canvasHeight?: number;
}

const isSceneDirtyQuery = (data: any): data is IsSceneDirtyQuery => {
    return (
        data &&
        typeof data === 'object' &&
        data.type === IS_SCENE_DIRTY
    );
};

const isSetAutoOrbitMessage = (data: any): data is SetAutoOrbitMessage => {
    return (
        data &&
        typeof data === 'object' &&
        data.type === SET_AUTO_ORBIT &&
        Object.prototype.hasOwnProperty.call(data, 'enabled')
    );
};

const isToolMessage = (data: any): data is ToolMessage => {
    return (
        data &&
        typeof data === 'object' &&
        data.type === TOOL_MESSAGE &&
        typeof data.tool === 'string'
    );
};

const postTo = (target: Window | undefined | null, payload: any, origin = '*') => {
    if (!target || !payload) {
        return;
    }

    try {
        target.postMessage(payload, origin || '*');
    } catch (e) {
        // Ignore iframe teardown races.
    }
};

const registerIframeApi = (events: Events) => {
    const diagnosticsEnabled = () => !!events.invoke('funes.diagnosticsEnabled');

    const getGraphicsState = () => {
        return (events.invoke('funes.graphicsState') as any) ?? {};
    };

    const postToolState = (target?: Window, origin?: string) => {
        if (!target && window.parent === window) {
            return;
        }

        const payload: ToolState = {
            type: TOOL_STATE,
            activeTool: (events.invoke('tool.active') as string) ?? null
        };
        postTo(target ?? window.parent, payload, origin);
    };

    const postLoadingState = (loading: boolean, target?: Window, origin?: string) => {
        if (!target && window.parent === window) {
            return;
        }

        const payload: LoadingStateMessage = {
            type: LOADING_STATE,
            loading: !!loading
        };
        postTo(target ?? window.parent, payload, origin);
    };

    const postLoadError = (error: any, target?: Window, origin?: string) => {
        if (!target && window.parent === window) {
            return;
        }

        const payload: LoadErrorMessage = {
            type: LOAD_ERROR,
            filename: typeof error?.filename === 'string' ? error.filename : undefined,
            message: typeof error?.message === 'string' ? error.message : `${error ?? 'Unknown load error'}`
        };
        postTo(target ?? window.parent, payload, origin);
    };

    const postGraphicsState = (target?: Window, origin?: string) => {
        if (!diagnosticsEnabled() || (!target && window.parent === window)) {
            return;
        }

        const state = getGraphicsState();
        const payload: GraphicsStateMessage = {
            type: GRAPHICS_STATE,
            requestedBackend: state.requestedBackend,
            actualBackend: state.actualBackend,
            deviceTypes: state.deviceTypes,
            webGPUAvailable: state.webGPUAvailable,
            graphicsInitMs: state.graphicsInitMs,
            devicePixelRatio: state.devicePixelRatio,
            canvasWidth: state.canvasWidth,
            canvasHeight: state.canvasHeight
        };
        postTo(target ?? window.parent, payload, origin);
    };

    const postPerformanceSample = (sample: Omit<PerformanceSampleMessage, 'type'>, target?: Window, origin?: string) => {
        if (!diagnosticsEnabled() || (!target && window.parent === window)) {
            return;
        }

        postTo(target ?? window.parent, {
            type: PERFORMANCE_SAMPLE,
            ...sample
        }, origin);
    };

    events.on('tool.activated', () => postToolState());
    events.on('tool.deactivated', () => postToolState());
    events.on('funes.loading', (loading: boolean) => postLoadingState(loading));
    events.on('funes.loadError', (error: any) => postLoadError(error));

    let pendingSplatReady = false;
    let readyElapsedMs: number | undefined;
    let sampleStartMs = performance.now();
    let lastFrameMs: number | undefined;
    let sampleFrameCount = 0;
    let sampleFrameTotalMs = 0;
    let sampleFrameMaxMs = 0;
    const loadStartMs = performance.now();
    const sampleWindowMs = 2000;

    events.on('scene.elementAdded', (element: any) => {
        if (element && element.type === 'splat') {
            pendingSplatReady = true;
        }
    });

    events.on('postrender', () => {
        const now = performance.now();
        const state = getGraphicsState();
        if (lastFrameMs !== undefined) {
            const frameMs = now - lastFrameMs;
            sampleFrameCount += 1;
            sampleFrameTotalMs += frameMs;
            sampleFrameMaxMs = Math.max(sampleFrameMaxMs, frameMs);
        }
        lastFrameMs = now;

        if (pendingSplatReady) {
            pendingSplatReady = false;
            readyElapsedMs = now - loadStartMs;
            postLoadingState(false);
            postGraphicsState();
        }

        if (!diagnosticsEnabled()) {
            return;
        }

        if (now - sampleStartMs >= sampleWindowMs && sampleFrameCount > 0) {
            postPerformanceSample({
                readyElapsedMs: readyElapsedMs === undefined ? undefined : Math.round(readyElapsedMs * 10) / 10,
                fps: Math.round((1000 / (sampleFrameTotalMs / sampleFrameCount)) * 10) / 10,
                averageFrameMs: Math.round((sampleFrameTotalMs / sampleFrameCount) * 10) / 10,
                maxFrameMs: Math.round(sampleFrameMaxMs * 10) / 10,
                frameCount: sampleFrameCount,
                canvasWidth: state.canvasWidth,
                canvasHeight: state.canvasHeight
            });
            sampleStartMs = now;
            sampleFrameCount = 0;
            sampleFrameTotalMs = 0;
            sampleFrameMaxMs = 0;
        }
    });

    window.requestAnimationFrame(() => postGraphicsState());

    window.addEventListener('message', (event: MessageEvent) => {
        const source = event.source as Window | null;
        if (!source) {
            return;
        }

        if (isSceneDirtyQuery(event.data)) {
            const response: IsSceneDirtyResponse = {
                type: IS_SCENE_DIRTY,
                result: events.invoke('scene.dirty') as boolean
            };
            source.postMessage(response, event.origin);
            return;
        }

        if (event.data && event.data.type === GRAPHICS_STATE) {
            postGraphicsState(source, event.origin);
            return;
        }

        if (isSetAutoOrbitMessage(event.data)) {
            const enabled = event.data.enabled !== false;
            events.fire('autoOrbit.set', enabled);
            const response: SetAutoOrbitResponse = {
                type: SET_AUTO_ORBIT,
                result: enabled
            };
            source.postMessage(response, event.origin);
            return;
        }

        if (isToolMessage(event.data)) {
            const tool = event.data.tool;
            if (ALLOWED_TOOLS.has(tool)) {
                if (event.data.enable === false) {
                    events.fire('tool.deactivate');
                } else {
                    events.fire(`tool.${tool}`);
                }
            }
            postToolState(source, event.origin);
        }
    });
};

export { registerIframeApi };
