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
  private maxStep: number;
  private lastTick: number | null;

  private onUpdate: (dt: number) => void;
  private onUserInput: () => void;
  private maxSubsteps: number;

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
    this.lastTick = null;
    this.maxStep = 1 / 60; // split large frame deltas into ~60fps-sized steps
    this.maxSubsteps = 60; // don't try to catch up more than ~1s in a single update

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
    this.lastTick = null;
    this.events.fire("autoOrbit.state", this.enabled);
    if (this.enabled) {
      // nudge a render once when enabling; subsequent frames will trigger from camera changes
      this.scene.forceRender = true;
    }
    return this.enabled;
  }

  update(deltaTime: number) {
    if (!this.enabled && this.intent && this.resumeAt !== null) {
      if (performance.now() >= this.resumeAt) {
        this.enabled = true;
        this.resumeAt = null;
        this.lastTick = null; // ignore accumulated time while paused
        this.events.fire("autoOrbit.state", this.enabled);
        this.scene.forceRender = true;
        return;
      }
    }
    if (!this.enabled) {
      this.lastTick = null;
      return;
    }
    const camera = this.scene?.camera;
    if (!camera) {
      return;
    }

    const nowSec = performance.now() / 1000;
    if (this.lastTick === null) {
      // seed clock on first enabled frame to avoid catching up a long pause
      this.lastTick = nowSec;
      return;
    }

    // Keep motion smooth when a frame stalls by subdividing long dt values.
    // This avoids both visible jumps (large single steps) and visible pauses
    // (dropping excess time when clamping).
    const rawDt = Math.max(0, nowSec - this.lastTick);
    this.lastTick = nowSec;
    let remaining = Math.min(
      rawDt,
      this.maxStep * this.maxSubsteps
    );
    while (remaining > 0) {
      const dt = Math.min(remaining, this.maxStep);
      const azim = camera.azim - this.speedDeg * dt;
      camera.setAzimElev(azim, camera.elevation, 0);
      remaining -= dt;
    }
  }

  dispose() {
    this.events.off("update", this.onUpdate, this);
    this.events.off("autoOrbit.set", this.setEnabled, this);
    this.events.off("camera.controller", this.onUserInput, this);
    this.resumeAt = null;
  }
}

export { AutoOrbitController };
