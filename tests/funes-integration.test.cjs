const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

class Events {
    functions = new Map();
    callbacks = new Map();
    fired = [];
    function(name, fn) { assert.equal(this.functions.has(name), false); this.functions.set(name, fn); }
    invoke(name, ...args) { return this.functions.get(name)?.(...args); }
    on(name, fn, scope) { this.callbacks.set(name, [...(this.callbacks.get(name) || []), { fn, scope }]); }
    off(name, fn, scope) { this.callbacks.set(name, (this.callbacks.get(name) || []).filter(x => x.fn !== fn || x.scope !== scope)); }
    fire(name, ...args) { this.fired.push([name, ...args]); for (const { fn, scope } of this.callbacks.get(name) || []) fn.apply(scope, args); }
}

function harness(search = '?funesParentOrigin=https://parent.test&funesDiagnostics=1') {
    const listeners = new Map();
    const messages = [];
    const transitions = [];
    const elements = new Map();
    const classes = new Set();
    const parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const win = {
        parent, devicePixelRatio: 2, location: new URL(`https://editor.test/${search}`),
        addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
        removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(x => x !== fn)); }
    };
    const document = {
        referrer: 'https://parent.test/article',
        getElementById: id => elements.get(id),
        createElement: () => ({}),
        head: { appendChild: element => elements.set(element.id, element) },
        documentElement: { classList: { add: name => classes.add(name) } }
    };
    let now = 0;
    let device = { deviceType: 'webgpu', destroy() { this.destroyed = true; } };
    const deviceCalls = [];
    class EntityTransformHandler {
        activate() { transitions.push('entity+'); }
        deactivate() { transitions.push('entity-'); }
    }
    class SplatsTransformHandler {
        activate() { transitions.push('selected+'); }
        deactivate() { transitions.push('selected-'); }
    }
    const stubs = {
        playcanvas: { createGraphicsDevice: async (_canvas, options) => { deviceCalls.push(options); return device; } },
        '../entity-transform-handler': { EntityTransformHandler },
        '../splats-transform-handler': { SplatsTransformHandler },
        '../pivot': { registerPivotEvents: events => events.fire('pivot.registered') },
        '../events': { Events }
    };
    const context = vm.createContext({ window: win, document, navigator: { gpu: {} },
        URL, URLSearchParams, Error, console, performance: { now: () => now } });
    const cache = new Map();
    const load = name => {
        const filename = path.resolve(__dirname, '../src/funes', `${name}.ts`);
        if (cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        cache.set(filename, module.exports);
        const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText;
        const run = vm.runInContext(`(function(require,module,exports){${output}\n})`, context);
        run(request => {
            if (stubs[request]) return stubs[request];
            if (request.startsWith('./')) return load(request.slice(2));
            throw new Error(`Unexpected dependency ${request}`);
        }, module, module.exports);
        return module.exports;
    };
    const dispatch = (name, event) => (listeners.get(name) || []).forEach(fn => fn(event));
    const send = (data, overrides = {}) => dispatch('message', { data, source: parent, origin: 'https://parent.test', ...overrides });
    return { load, messages, win, document, send, dispatch, transitions, classes, elements, deviceCalls,
        tick(value) { now = value; }, setDevice(value) { device = value; } };
}

const hello = { type: 'funes:hello', protocolVersion: 1, requestId: 'hello-1' };

test('handshake is ready before a model and reports exact version and WebGPU-only capabilities', () => {
    const h = harness();
    h.load('bridge').registerBridge(new Events(), h.win.location);
    h.send(hello);
    assert.equal(h.messages.length, 1);
    const { message, origin } = h.messages[0];
    assert.equal(origin, 'https://parent.test');
    assert.equal(message.type, 'funes:hello:result');
    assert.equal(message.requestId, 'hello-1');
    assert.equal(message.protocolVersion, 1);
    assert.equal(message.runtimeKind, 'editor');
    assert.equal(message.runtimeVersion, '3.3.0');
    assert.equal(message.integrationVersion, 1);
    assert.equal(message.graphicsBackend, 'webgpu');
    assert.equal(message.capabilities.webglFallback, false);
    assert.equal(message.capabilities.autoOrbit, true);
    assert.equal(message.capabilities.streamedSogEdit, undefined);
    assert.equal(h.messages.some(x => x.message.type === 'supersplat:loading'), false);
});

test('handshake and legacy commands require the actual parent, exact origin and valid request shape', () => {
    const h = harness();
    const events = new Events();
    const bridge = h.load('bridge').registerBridge(events, h.win.location);
    bridge.connectControls();
    h.send(hello, { source: {} });
    h.send(hello, { origin: 'https://attacker.test' });
    h.send({ ...hello, protocolVersion: 2 });
    h.send({ ...hello, requestId: '' });
    h.send({ ...hello, requestId: 'x'.repeat(129) });
    h.send({ type: 'supersplat:auto-orbit', enabled: true }, { source: {} });
    h.send({ type: 'supersplat:tool', tool: 'rotate' }, { origin: 'https://attacker.test' });
    assert.equal(h.messages.length, 0);
    assert.equal(events.fired.length, 0);
    h.send(hello);
    assert.equal(h.messages.length, 1);
});

test('explicit invalid origins fail closed and referrer preserves legacy hosts', () => {
    const { resolveParentOrigin } = harness().load('bridge');
    assert.equal(resolveParentOrigin(new URL('https://editor.test/?embedOrigin=*'), 'https://parent.test/'), null);
    assert.equal(resolveParentOrigin(new URL('https://editor.test/?embedOrigin=https://parent.test/path'), ''), null);
    assert.equal(resolveParentOrigin(new URL('https://editor.test/'), 'https://parent.test/path'), 'https://parent.test');
    assert.equal(resolveParentOrigin(new URL('https://editor.test/'), ''), 'https://editor.test');
});

test('early commands are queued with latest intent until scene controls attach', () => {
    const h = harness();
    const events = new Events();
    events.function('tool.active', () => 'rotate');
    const bridge = h.load('bridge').registerBridge(events, h.win.location);
    h.send({ type: 'supersplat:auto-orbit', enabled: true });
    h.send({ type: 'supersplat:auto-orbit', enabled: false });
    h.send({ type: 'supersplat:tool', tool: 'move' });
    h.send({ type: 'supersplat:tool', tool: 'rotate' });
    assert.equal(events.fired.length, 0);
    bridge.connectControls();
    assert.deepEqual(events.fired, [['autoOrbit.set', false], ['tool.rotate']]);
    h.send({ type: 'supersplat:tool', tool: 'unknown' });
    h.send({ type: 'supersplat:auto-orbit', enabled: 'false' });
    assert.equal(events.fired.length, 2);
});

test('first rendered splat ends loading; graphics and performance report actual backend', () => {
    const h = harness();
    const events = new Events();
    const bridge = h.load('bridge').registerBridge(events, h.win.location);
    bridge.setGraphics(() => ({ actualBackend: 'webgpu', canvasWidth: 800, canvasHeight: 600 }));
    bridge.loading(true);
    events.fire('postrender');
    assert.equal(h.messages.some(x => x.message.loading === false), false);
    events.fire('scene.elementAdded', { type: 'splat' });
    h.tick(100);
    events.fire('postrender');
    assert.equal(h.messages.filter(x => x.message.loading === false).length, 1);
    h.tick(2100);
    events.fire('postrender');
    const sample = h.messages.find(x => x.message.type === 'supersplat:performance').message;
    assert.equal(sample.readyElapsedMs, 100);
    assert.equal(sample.actualBackend, 'webgpu');
    assert.ok(sample.frameCount > 0);
    bridge.error(new Error('download failed'), 'model.sog');
    const error = h.messages.find(x => x.message.type === 'supersplat:error').message;
    assert.equal(error.message, 'download failed');
    assert.equal(error.filename, 'model.sog');
});

test('dispose removes message, error and frame listeners', () => {
    const h = harness();
    const events = new Events();
    const bridge = h.load('bridge').registerBridge(events, h.win.location);
    bridge.dispose();
    h.send(hello);
    h.dispatch('error', { message: 'late' });
    events.fire('scene.elementAdded', { type: 'splat' });
    events.fire('postrender');
    assert.equal(h.messages.length, 0);
});

test('load aliases retain query URLs, repeated targets, explicit filenames and encoded paths', () => {
    const h = harness();
    const { collectImportTargets } = h.load('query-loader');
    const url = new URL('https://editor.test/');
    url.searchParams.append('load', 'https://cdn.test/a%20b.sog?signature=x%2Fy');
    url.searchParams.append('model', 'https%3A%2F%2Fcdn.test%2Fsecond.ply');
    url.searchParams.append('filename', 'first.sog');
    url.searchParams.append('splatUrl', '');
    const result = collectImportTargets(url);
    assert.equal(result.length, 2);
    assert.equal(result[0].filename, 'first.sog');
    assert.equal(result[0].url, 'https://cdn.test/a%20b.sog?signature=x%2Fy');
    assert.equal(result[1].filename, 'second.ply');
    assert.equal(result[1].url, 'https://cdn.test/second.ply');
});

test('whole selection and empty selection use entity transforms, partial selection uses splats', () => {
    const h = harness();
    const events = new Events();
    h.load('adapter-v3').registerFunesTransformHandler(events);
    events.fire('selection.changed', { numSelected: 0, numSplats: 10 });
    events.fire('splat.stateChanged', { numSelected: 4, numSplats: 10 });
    events.fire('splat.stateChanged', { numSelected: 10, numSplats: 10 });
    events.fire('selection.changed', null);
    assert.deepEqual(h.transitions, ['entity+', 'entity-', 'selected+', 'selected-', 'entity+', 'entity-']);
});

test('device creation never pretends WebGL fallback and validates the actual device', async () => {
    const h = harness();
    const { createEditorDevice } = h.load('adapter-v3');
    await assert.rejects(createEditorDevice({}, new URL('https://editor.test/?funesRenderer=webgl2')), /requires WebGPU/);
    assert.equal(h.deviceCalls.length, 0);
    const device = await createEditorDevice({}, new URL('https://editor.test/'));
    assert.equal(device.deviceType, 'webgpu');
    assert.deepEqual(Array.from(h.deviceCalls[0].deviceTypes), ['webgpu']);
    const invalid = { deviceType: 'webgl2', destroy() { this.destroyed = true; } };
    h.setDevice(invalid);
    await assert.rejects(createEditorDevice({}, new URL('https://editor.test/')), /working WebGPU/);
    assert.equal(invalid.destroyed, true);
});

test('swallowed upstream import failures produce parent-visible errors', async () => {
    const h = harness();
    const events = new Events();
    events.function('import', async () => []);
    await assert.rejects(h.load('adapter-v3').importTarget(events, { filename: 'missing.sog', url: 'https://cdn.test/missing.sog' }), /Unable to load/);
});

test('embed chrome stays hidden and preserves FUNES camera defaults', () => {
    const h = harness();
    const events = new Events();
    const { applyFunesEmbedConfig, isFunesEmbeddedMode } = h.load('embed-ui');
    assert.equal(isFunesEmbeddedMode(new URL('https://editor.test/?load=a.sog')), true);
    assert.equal(isFunesEmbeddedMode(new URL('https://editor.test/?load=a.sog&showEditor=1')), false);
    applyFunesEmbedConfig(events);
    applyFunesEmbedConfig(events);
    assert.equal(h.elements.size, 1);
    assert.equal(h.classes.has('funes-embed-mode'), true);
    assert.ok(h.elements.get('funes-embed-style').textContent.includes('#scene-panel'));
    assert.ok(events.fired.some(([name, value]) => name === 'grid.setVisible' && value === false));
    const defaults = h.load('adapter-v3').sceneDefaults;
    assert.equal(defaults.camera.fov, 75);
    assert.equal(defaults.controls.initialAzim, 0);
    assert.equal(defaults.controls.initialElev, 0);
});

test('auto orbit pauses during camera input, resumes after delay, and remains off when disabled', () => {
    const h = harness();
    const events = new Events();
    const poses = [];
    const scene = { camera: { azim: 0, elevation: 10, setAzimElev: (...args) => poses.push(args) } };
    const { AutoOrbitController } = h.load('auto-orbit');
    const orbit = new AutoOrbitController(events, scene, { enabled: true });
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 1);
    events.fire('camera.controller', 'pointer');
    h.tick(999);
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 1);
    h.tick(1000);
    events.fire('update', 1 / 60);
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 2);
    events.fire('autoOrbit.set', false);
    h.tick(5000);
    events.fire('camera.controller', 'pointer');
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 2);
    orbit.dispose();
    events.fire('autoOrbit.set', true);
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 2);
});

test('bootstrap keeps early host intent, imports the model, and cleans up on pagehide', async () => {
    const h = harness('?funesParentOrigin=https://parent.test&load=https://cdn.test/model.sog');
    const events = new Events();
    const imports = [];
    events.function('import', async targets => { imports.push(...targets); return [{ type: 'splat' }]; });
    events.function('tool.active', () => null);
    const integration = h.load('bootstrap').createFunesIntegration(events, h.win.location);
    h.send(hello);
    h.send({ type: 'supersplat:auto-orbit', enabled: true });
    assert.equal(h.messages[0].message.runtimeVersion, '3.3.0');
    const device = await integration.createGraphicsDevice({});
    const poses = [];
    const scene = { app: { graphicsDevice: device }, camera: { azim: 0, elevation: 0, setAzimElev: (...args) => poses.push(args) } };
    integration.attach(scene, { width: 10, height: 10 });
    events.fire('update', 1 / 60);
    assert.equal(poses.length, 1);
    await integration.load();
    assert.equal(imports.length, 1);
    assert.equal(imports[0].url, 'https://cdn.test/model.sog');
    assert.equal(h.messages.some(x => x.message.loading === false), false);
    events.fire('scene.elementAdded', { type: 'splat' });
    events.fire('postrender');
    assert.equal(h.messages.filter(x => x.message.loading === false).length, 1);
    h.dispatch('pagehide', {});
    const before = h.messages.length;
    h.send(hello);
    events.fire('update', 1 / 60);
    assert.equal(h.messages.length, before);
    assert.equal(poses.length, 1);
});
