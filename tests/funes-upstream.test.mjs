import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFunesUpstream } from '../scripts/check-funes-upstream.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pinned 3.3.0 dependency and adapter seams pass before build', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'funes-upstream.json')));
    assert.deepEqual(checkFunesUpstream(root), { runtimeVersion: '3.3.0', protocolVersion: 1, seams: manifest.seams.length });
    const seamFiles = new Set(manifest.seams.map(seam => seam.file));
    for (const file of ['src/controllers.ts', 'src/splat.ts', 'src/element.ts', 'src/selection.ts',
        'src/tools/tool-manager.ts', 'src/ui/editor.ts', 'src/ui/bottom-toolbar.ts',
        'src/ui/right-toolbar.ts', 'src/ui/menu.ts', 'src/ui/view-cube.ts',
        'src/ui/timeline-panel.ts', 'src/ui/data-panel.ts', 'src/ui/scene-panel.ts', 'src/ui/status-bar.ts']) {
        assert.ok(seamFiles.has(file), `${file} must remain in the reviewed API seams`);
    }
});

test('upstream or protocol drift fails instead of silently applying an outdated adapter', () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'funes-upstream-test-'));
    try {
        const manifest = JSON.parse(readFileSync(path.join(root, 'funes-upstream.json')));
        for (const file of ['funes-upstream.json', 'package.json', 'package-lock.json', manifest.integration.adapter,
            ...Object.keys(manifest.dependencies).map(name => `node_modules/${name}/package.json`),
            ...manifest.seams.map(x => x.file)]) {
            mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
            writeFileSync(path.join(temp, file), readFileSync(path.join(root, file)));
        }
        const pkg = JSON.parse(readFileSync(path.join(temp, 'package.json')));
        pkg.devDependencies.playcanvas = '2.23.0';
        writeFileSync(path.join(temp, 'package.json'), JSON.stringify(pkg));
        assert.throws(() => checkFunesUpstream(temp), /playcanvas declaration changed/);
        writeFileSync(path.join(temp, 'package.json'), readFileSync(path.join(root, 'package.json')));
        const lock = JSON.parse(readFileSync(path.join(temp, 'package-lock.json')));
        lock.packages[''].devDependencies['@playcanvas/pcui'] = '^6.1.4';
        writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify(lock));
        assert.throws(() => checkFunesUpstream(temp), /pcui lock declaration differs/);
        lock.packages[''].devDependencies['@playcanvas/pcui'] = '6.1.4';
        lock.packages['node_modules/@playcanvas/splat-transform'].version = '3.5.0';
        writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify(lock));
        assert.throws(() => checkFunesUpstream(temp), /splat-transform locked version differs/);
        writeFileSync(path.join(temp, 'package-lock.json'), readFileSync(path.join(root, 'package-lock.json')));
        for (const name of Object.keys(manifest.dependencies)) {
            const installedPath = path.join(temp, `node_modules/${name}/package.json`);
            const original = readFileSync(installedPath);
            const installed = JSON.parse(original);
            installed.version = '999.0.0';
            writeFileSync(installedPath, JSON.stringify(installed));
            assert.throws(() => checkFunesUpstream(temp), /installed version differs/);
            rmSync(installedPath);
            assert.throws(() => checkFunesUpstream(temp), /installed package is missing/);
            writeFileSync(installedPath, original);
        }
        writeFileSync(path.join(temp, 'src/camera.ts'), '// changed upstream camera');
        assert.throws(() => checkFunesUpstream(temp), /src\/camera.ts: reviewed API seam changed/);
        writeFileSync(path.join(temp, 'src/camera.ts'), readFileSync(path.join(root, 'src/camera.ts')));
        const menuPath = path.join(temp, 'src/ui/menu.ts');
        const menuSource = readFileSync(menuPath, 'utf8');
        const changedMenu = menuSource.replace("id: 'menu'", "id: 'menu-upstream-changed'");
        assert.notEqual(changedMenu, menuSource, 'fixture must change an actual embedded selector definition');
        writeFileSync(menuPath, changedMenu);
        assert.throws(() => checkFunesUpstream(temp), /src\/ui\/menu.ts: reviewed API seam changed/);
        writeFileSync(menuPath, menuSource);
        writeFileSync(path.join(temp, manifest.integration.adapter), readFileSync(path.join(root, manifest.integration.adapter), 'utf8').replace('const protocolVersion = 1;', 'const protocolVersion = 2;'));
        assert.throws(() => checkFunesUpstream(temp), /protocolVersion differs/);
    } finally { rmSync(temp, { recursive: true, force: true }); }
});
