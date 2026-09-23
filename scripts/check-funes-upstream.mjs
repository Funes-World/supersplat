import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function checkFunesUpstream(root = defaultRoot) {
    const read = (file) => readFileSync(path.join(root, file));
    const manifest = JSON.parse(read('funes-upstream.json'));
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    const failures = [];
    if (pkg.version !== manifest.upstream.version) failures.push('Editor package version changed');
    for (const [name, version] of Object.entries(manifest.dependencies)) {
        if (pkg.devDependencies?.[name] !== version) failures.push(`${name} declaration changed from ${version}`);
        if (lock.packages?.['']?.devDependencies?.[name] !== version) {
            failures.push(`${name} lock declaration differs from ${version}`);
        }
        if (lock.packages?.[`node_modules/${name}`]?.version !== version) {
            failures.push(`${name} locked version differs from ${version}`);
        }
        try {
            const installed = JSON.parse(read(`node_modules/${name}/package.json`));
            if (installed.name !== name || installed.version !== version) {
                failures.push(`${name} installed version differs from ${version}`);
            }
        } catch { failures.push(`${name} installed package is missing or unreadable; run npm ci`); }
    }
    for (const seam of manifest.seams) {
        try {
            if (sha256(read(seam.file)) !== seam.integratedSha256) failures.push(`${seam.file}: reviewed API seam changed`);
        } catch { failures.push(`${seam.file}: reviewed API seam missing`); }
    }
    const adapter = read(manifest.integration.adapter).toString();
    for (const [name, value] of Object.entries({
        runtimeVersion: manifest.upstream.version,
        integrationVersion: manifest.integration.version,
        protocolVersion: manifest.integration.protocolVersion
    })) {
        const expected = typeof value === 'string' ? `'${value}'` : `${value}`;
        if (!adapter.includes(`const ${name} = ${expected};`)) failures.push(`${name} differs between adapter and manifest`);
    }
    if (failures.length) {
        throw new Error(`FUNES compatibility check failed. Review src/funes/adapter-v3.ts before updating the manifest:\n${failures.join('\n')}`);
    }
    return { runtimeVersion: manifest.upstream.version, protocolVersion: manifest.integration.protocolVersion, seams: manifest.seams.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = checkFunesUpstream();
        console.log(`FUNES Editor ${result.runtimeVersion}: ${result.seams} reviewed seams; protocol ${result.protocolVersion}.`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
