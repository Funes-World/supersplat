import { Events } from "./events";

const IS_SCENE_DIRTY = "supersplat:is-scene-dirty";
const SET_AUTO_ORBIT = "supersplat:auto-orbit";
const TOOL_MESSAGE = "supersplat:tool";
const TOOL_STATE = "supersplat:tool-state";
const LOADING_STATE = "supersplat:loading";

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

const isSceneDirtyQuery = (data: any): data is IsSceneDirtyQuery => {
    return (
        data &&
        typeof data === "object" &&
        data.type === IS_SCENE_DIRTY
    );
};

const isSetAutoOrbitMessage = (data: any): data is SetAutoOrbitMessage => {
    return (
        data &&
        typeof data === "object" &&
        data.type === SET_AUTO_ORBIT &&
        data.hasOwnProperty("enabled")
    );
};

const isToolMessage = (data: any): data is ToolMessage => {
    return (
        data &&
        typeof data === "object" &&
        data.type === TOOL_MESSAGE &&
        typeof data.tool === "string"
    );
};

const registerIframeApi = (events: Events) => {
    const postToolState = (target?: Window, origin?: string) => {
        if (!target && window.parent === window) return;
        const active = (events.invoke("tool.active") as string) ?? null;
        const payload: ToolState = {
            type: TOOL_STATE,
            activeTool: active,
        };
        try {
            const win = target ?? window.parent;
            if (win) {
                win.postMessage(payload, origin ?? "*");
            }
        } catch (e) {}
    };

    const postLoadingState = (loading: boolean, target?: Window, origin?: string) => {
        if (!target && window.parent === window) return;
        const payload: LoadingStateMessage = {
            type: LOADING_STATE,
            loading: !!loading
        };
        try {
            const win = target ?? window.parent;
            if (win) {
                win.postMessage(payload, origin ?? "*");
            }
        } catch (e) {}
    };

    events.on("tool.activated", () => postToolState());
    events.on("tool.deactivated", () => postToolState());
    events.on("startSpinner", () => postLoadingState(true));
    events.on("stopSpinner", () => postLoadingState(false));

    window.addEventListener("message", (event: MessageEvent) => {
        const source = event.source as Window | null;
        if (!source) {
            return;
        }

        if (isSceneDirtyQuery(event.data)) {
            const response: IsSceneDirtyResponse = {
                type: IS_SCENE_DIRTY,
                result: events.invoke("scene.dirty") as boolean,
            };
            source.postMessage(response, event.origin);
            return;
        }

        if (isSetAutoOrbitMessage(event.data)) {
            const enabled = event.data.enabled !== false;
            events.fire("autoOrbit.set", enabled);
            const response: SetAutoOrbitResponse = {
                type: SET_AUTO_ORBIT,
                result: enabled,
            };
            source.postMessage(response, event.origin);
            return;
        }

        if (isToolMessage(event.data)) {
            const tool = event.data.tool;
            const enable = event.data.enable;
            if (enable === false) {
                events.fire("tool.deactivate");
            } else {
                events.fire(`tool.${tool}`);
            }
            postToolState(source, event.origin);
            return;
        }
    });
};

export { registerIframeApi };
