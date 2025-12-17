import { Events } from "./events";
import { Scene } from "./scene";

type AutoOrbitOptions = {
  enabled?: boolean;
  speedDeg?: number;
};

class AutoOrbitController {
  private events: Events;
  private scene: Scene;
  private enabled: boolean;
  private speedDeg: number;

  private onUpdate: (dt: number) => void;

  constructor(events: Events, scene: Scene, options: AutoOrbitOptions = {}) {
    this.events = events;
    this.scene = scene;
    this.enabled = options.enabled !== false;
    this.speedDeg = typeof options.speedDeg === "number" ? options.speedDeg : 10;

    this.onUpdate = (dt: number) => this.update(dt);

    this.events.on("update", this.onUpdate, this);
    this.events.on("autoOrbit.set", this.setEnabled, this);

    this.events.function("autoOrbit.enabled", () => this.enabled);
    this.events.function("autoOrbit.set", (state: boolean) =>
      this.setEnabled(state)
    );
  }

  setEnabled(state: boolean) {
    const next = state !== false;
    if (next === this.enabled) {
      return this.enabled;
    }
    this.enabled = next;
    this.events.fire("autoOrbit.state", this.enabled);
    return this.enabled;
  }

  update(deltaTime: number) {
    if (!this.enabled) {
      return;
    }
    const camera = this.scene?.camera;
    if (!camera) {
      return;
    }
    const azim = camera.azim + this.speedDeg * deltaTime;
    camera.setAzimElev(azim, camera.elevation, 0);
  }

  dispose() {
    this.events.off("update", this.onUpdate, this);
    this.events.off("autoOrbit.set", this.setEnabled, this);
  }
}

export { AutoOrbitController };
