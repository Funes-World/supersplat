const PARAM_KEYS = new Set(['load', 'model', 'splat', 'splatUrl']);
type ImportTarget = { filename: string; url: string };

const decodeIfEncoded = (value: string) => {
    const trimmed = value.trim();
    if (/^(?:https?:|blob:|data:|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
    try { return decodeURIComponent(trimmed); } catch { return trimmed; }
};

const collectImportTargets = (url: URL): ImportTarget[] => {
    const targets: ImportTarget[] = [];
    const names = url.searchParams.getAll('filename').map(decodeIfEncoded);
    url.searchParams.forEach((value, key) => {
        if (!PARAM_KEYS.has(key)) return;
        const address = decodeIfEncoded(value);
        if (!address) return;
        const basename = address.split(/[?#]/)[0].split(/[/\\]/).pop() || 'model';
        targets.push({ filename: names[targets.length] || basename, url: address });
    });
    return targets;
};

export { collectImportTargets };
