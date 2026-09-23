---
title: FUNES Hosted Editor Integration
status: current
owner: web-platform
last_updated: 2026-09-18
related_docs:
  - README.md
---

# FUNES Hosted Editor Integration

## Overview

This hosted Editor is based on official SuperSplat Editor **3.3.0**, commit `f345ae5d667f4134e21be7dec01b09b78893203a`. FUNES behavior lives under `src/funes/`. The upstream editor remains responsible for geometry, rendering, file formats, selection, history, and camera implementation. The only modified upstream source is `src/main.ts`, which installs the integration through bootstrap calls.

The [repository README](../../README.md) is the entry point. `funes-upstream.json` records the reviewed upstream revision, runtime dependencies, integration/protocol versions, and API seams. This document describes the hosted website Editor. CMS editing/export and the official static Viewer have separate adapters and capability sets.

## Scope

The integration preserves the website fork's query loading aliases, hidden embed chrome, auto-orbit, transform behavior, scene-dirty query, first-render loading notifications, and optional graphics/performance diagnostics. It adds an explicit version/capability handshake and checks the real parent window and origin before processing commands.

Editor 3.3.0 requires WebGPU. The former Editor WebGL fallback and its shader-transpiler assets are removed. The website's separate official Viewer remains the place for WebGL viewing. Build tooling uses Node 22 or newer, matching the pinned `@playcanvas/splat-transform@3.4.2` and `concurrently` dependencies.

## User-visible behavior

An embed remains free of editor chrome, grid, selection overlays, bounds, and annotations. `showEditor=1` or `funesShowEditor=1` restores the standalone editor UI. `load`, `model`, `splat`, and `splatUrl` retain the existing URL-based loading contract; repeated targets and `filename` overrides are supported.

The existing defaults are retained: gray background, 75-degree camera field of view, and initial azimuth/elevation zero. Explicit URL camera values take precedence. Camera reset uses the pinned native editor reset implementation with these resolved defaults. A whole-layer selection uses an entity transform; a partial selection uses the native splat transform handler.

Auto-orbit starts disabled in embeds until the host enables it. It pauses on camera input and resumes after one second if still enabled. Standalone behavior retains the old default-on orbit. The parent receives `supersplat:loading=false` after a splat has been added and a frame has rendered; the handshake alone does not signal that the model is ready.

## Technical approach

### Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/funes/bootstrap.ts` | Wiring, load lifecycle, cleanup, and renderer initialization error reporting. |
| `src/funes/adapter-v3.ts` | Pinned Editor API calls, graphics creation, default camera configuration, import result handling, and transform-handler registration. |
| `src/funes/bridge.ts` | Validated parent messages, capabilities, loading/errors, and diagnostics. |
| `src/funes/query-loader.ts` | URL aliases and filename handling without destructive double decoding. |
| `src/funes/embed-ui.ts` | Embed chrome and overlay policy applied after stored preferences. |
| `src/funes/auto-orbit.ts` | Existing FUNES rotation and pause/resume behavior. |

The integration no longer replaces upstream `iframe-api.ts`, `file-handler.ts`, `scene-config.ts`, or `transform-handler.ts`. The bootstrap installs the FUNES bridge instead of the upstream message listener. Upstream `requestNavigateHome` remains available to the standalone menubar. Native 3.3 service-worker cleanup is retained unchanged.

### Handshake and legacy messages

The host sends:

```json
{"type":"funes:hello","protocolVersion":1,"requestId":"unique-request"}
```

The Editor responds before model readiness:

```json
{
  "type": "funes:hello:result",
  "requestId": "unique-request",
  "protocolVersion": 1,
  "runtimeKind": "editor",
  "runtimeVersion": "3.3.0",
  "integrationVersion": 1,
  "graphicsBackend": "webgpu",
  "capabilities": {
    "autoOrbit": true,
    "toolControl": true,
    "graphicsDiagnostics": true,
    "webglFallback": false
  }
}
```

`protocolVersion` controls compatibility; `integrationVersion` identifies the integration release. This hosted website fork does not advertise CMS export or LOD-edit capabilities. Early orbit/tool commands are queued until the native controls exist, so an early handshake cannot lose host intent.

Existing `supersplat:is-scene-dirty`, `supersplat:auto-orbit`, `supersplat:tool`, `supersplat:tool-state`, `supersplat:loading`, `supersplat:error`, `supersplat:graphics-state`, and `supersplat:performance` messages remain. Graphics/performance output requires a truthy `funesDiagnostics` flag. Errors are always reported. The reported actual graphics backend comes from the created device, and `webglFallback` remains false.

The expected parent origin comes from `funesParentOrigin`, the legacy `embedOrigin`, the referrer's origin, or the Editor's own origin, in that order. An invalid explicit origin disables communication. Incoming messages require both `event.source === window.parent` and an exact origin match. Outgoing messages never use `*`.

## Edge cases / failure modes

An unavailable WebGPU device or an explicit `funesRenderer=webgl2` request produces a clear error. The parent must not retry the 3.3 Editor with WebGL after it has received `webglFallback:false`; that retry cannot work. Import failures caught by upstream's popup are translated from an empty result into a parent-visible load error.

A successful handshake does not imply a model or GPU has finished loading. Hosts must continue using the separate model loading/first-frame state. Disposing the page removes bridge listeners and the auto-orbit controller.

The integration does not alter CMS records, draft/publication state, locale, permissions, ZIP storage, or server-side conversion. Website LOD streaming remains owned by the official Viewer plus the website ZIP Range adapter.

## Testing / verification

Use Node 22 or newer:

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
```

`npm prebuild` and `npm test` run `scripts/check-funes-upstream.mjs`. It checks exact PlayCanvas, splat-transform, and PCUI versions in the package declarations, lockfile root declarations, lockfile resolved packages, and installed packages. It also checks source hashes of the reviewed API seams listed in `funes-upstream.json`, including bootstrap hooks, camera input events, selection counts and events, tool dispatch, and the upstream UI components defining embedded selectors, plus adapter protocol/runtime constants. A stale or npm-linked runtime cannot pass solely because package.json still has the expected pin. Updating dependencies or upstream source requires reviewing the adapter and deliberately refreshing the manifest; the checker never modifies code.

The focused tests cover handshake timing and schema, wrong parent/origin, incompatible protocol, early command queuing, load/error/diagnostic behavior, cleanup, query aliases, full/partial transforms, WebGPU-only validation, import errors, embed defaults, and auto-orbit pause/resume. Negative seam tests prove declaration, lockfile, installed dependency, missing installation, API source, embedded UI selector definitions, and protocol drift fail before build.

The upstream-pinned ESLint 10 configuration currently crashes in its `import/order` dependency with `sourceCode.getTokenOrCommentAfter is not a function`. This is an upstream toolchain limitation; no linter dependency workaround is included in this integration. Type checking, focused tests, and the production build remain the required runnable checks. On 2026-09-18 a real browser rendered the local SH3 PLY fixture over WebGPU, negotiated protocol 1, hid embedded editor chrome and acknowledged automatic rotation. Validate the deployed host on its supported devices before release.

## Code pointers

- `src/main.ts`: integration bootstrap hooks.
- `src/funes/adapter-v3.ts`: version-sensitive Editor API boundary.
- `src/funes/bridge.ts`: parent origin and capability contract.
- `funes-upstream.json`: upstream revision and reviewed seams.
- `scripts/check-funes-upstream.mjs`: fail-fast upgrade check.
- `tests/funes-integration.test.cjs`: bridge and behavior regression fixtures.
- `tests/funes-upstream.test.mjs`: version/seam drift tests.

## Follow-up work

Validate the production host's WebGPU rendering and the parent's no-WebGL-retry behavior. Future upstream upgrades should begin from a pinned official tag, review only the adapter seams, and run the same contract fixtures. Keep CMS export and website Viewer capabilities separate, even if their protocol envelope is shared.
