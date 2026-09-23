import { Events } from '../events';
import { Scene } from '../scene';

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
    private maxSubsteps: number;
    private catchUpLimit: number;
    private smoothedDt: number;
    private dtSmoothing: number;

    private onUpdate: (dt: number) => void;
    private onUserInput: () => void;

    constructor(events: Events, scene: Scene, options: AutoOrbitOptions = {}) {
        this.events = events;
        this.scene = scene;
        this.intent = options.enabled !== false;
        this.enabled = this.intent;
        this.speedDeg = typeof options.speedDeg === 'number' ? options.speedDeg : 10;
        this.resumeDelayMs = typeof options.resumeDelayMs === 'number' ? Math.max(0, options.resumeDelayMs) : 1000;
        this.resumeAt = null;
        this.maxStep = 1 / 60;
        this.maxSubsteps = 6;
        this.catchUpLimit = this.maxStep * this.maxSubsteps;
        this.smoothedDt = this.maxStep;
        this.dtSmoothing = 0.2;

        this.onUpdate = (dt: number) => this.update(dt);
        this.onUserInput = () => this.handleUserInput();

        this.events.on('update', this.onUpdate, this);
        this.events.on('autoOrbit.set', this.setEnabled, this);
        this.events.on('camera.controller', this.onUserInput, this);

        this.events.function('autoOrbit.enabled', () => this.enabled);
        this.events.function('autoOrbit.set', (state: boolean) => this.setEnabled(state));
    }

    private handleUserInput() {
        if (!this.intent && !this.enabled) {
            return;
        }

        if (this.intent && this.enabled) {
            this.enabled = false;
            this.events.fire('autoOrbit.state', this.enabled);
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
        this.smoothedDt = this.maxStep;
        this.events.fire('autoOrbit.state', this.enabled);

        if (this.enabled) {
            this.scene.forceRender = true;
        }

        return this.enabled;
    }

    update(deltaTime: number) {
        if (!this.enabled && this.intent && this.resumeAt !== null) {
            if (performance.now() >= this.resumeAt) {
                this.enabled = true;
                this.resumeAt = null;
                this.events.fire('autoOrbit.state', this.enabled);
                this.scene.forceRender = true;
                return;
            }
        }

        if (!this.enabled) {
            this.smoothedDt = this.maxStep;
            return;
        }

        const camera = this.scene.camera;
        if (!camera) {
            return;
        }

        const rawDt = Math.max(0, Math.min(deltaTime, this.catchUpLimit));
        this.smoothedDt += (rawDt - this.smoothedDt) * this.dtSmoothing;
        const dt = Math.min(this.smoothedDt, this.maxStep);

        camera.setAzimElev(camera.azim - this.speedDeg * dt, camera.elevation, 0);
        this.scene.forceRender = true;
    }

    dispose() {
        this.events.off('update', this.onUpdate, this);
        this.events.off('autoOrbit.set', this.setEnabled, this);
        this.events.off('camera.controller', this.onUserInput, this);
        this.resumeAt = null;
    }
}

export { AutoOrbitController };
