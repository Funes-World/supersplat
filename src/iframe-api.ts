import { Events } from "./events";

const IS_SCENE_DIRTY = "supersplat:is-scene-dirty";
const SET_AUTO_ORBIT = "supersplat:auto-orbit";

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

const registerIframeApi = (events: Events) => {
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
    });
};

export { registerIframeApi };
