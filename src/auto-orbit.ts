import { Events } from "./events";
import { Scene } from "./scene";

type AutoOrbitOptions = {
  enabled?: boolean;
  speedDeg?: number;
  resumeDelayMs?: number;
};

class AutoOrbitController {
  private events: Events;
  private scene: Scene;
  private enabled: boolean;
  private intent: boolean;
  private speedDeg: number;
  private resumeDelayMs: number;
  private resumeAt: number | null;

  private onUpdate: (dt: number) => void;
  private onUserInput: () => void;

  constructor(events: Events, scene: Scene, options: AutoOrbitOptions = {}) {
    this.events = events;
    this.scene = scene;
    this.intent = options.enabled !== false;
    this.enabled = this.intent;
    this.speedDeg =
      typeof options.speedDeg === "number" ? options.speedDeg : 10;
    this.resumeDelayMs =
      typeof options.resumeDelayMs === "number"
        ? Math.max(0, options.resumeDelayMs)
        : 1000;
    this.resumeAt = null;

    this.onUpdate = (dt: number) => this.update(dt);
    this.onUserInput = () => this.handleUserInput();

    this.events.on("update", this.onUpdate, this);
    this.events.on("autoOrbit.set", this.setEnabled, this);
    this.events.on("camera.controller", this.onUserInput, this);

    this.events.function("autoOrbit.enabled", () => this.enabled);
    this.events.function("autoOrbit.set", (state: boolean) =>
      this.setEnabled(state)
    );
  }

  private handleUserInput() {
    if (!this.intent && !this.enabled) return;
    if (this.intent && this.enabled) {
      this.enabled = false;
      this.events.fire("autoOrbit.state", this.enabled);
    }
    if (this.intent) {
      this.resumeAt = performance.now() + this.resumeDelayMs;
    }
  }

  setEnabled(state: boolean) {
    const next = state !== false;
    this.intent = next;
    this.enabled = next;
    this.resumeAt = null;
    this.events.fire("autoOrbit.state", this.enabled);
    return this.enabled;
  }

  update(deltaTime: number) {
    if (!this.enabled && this.intent && this.resumeAt !== null) {
      if (performance.now() >= this.resumeAt) {
        this.enabled = true;
        this.resumeAt = null;
        this.events.fire("autoOrbit.state", this.enabled);
      }
    }
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
    this.events.off("camera.controller", this.onUserInput, this);
    this.resumeAt = null;
  }
}

export { AutoOrbitController };
