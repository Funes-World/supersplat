import { Events } from './events';

type ImportTarget = {
    filename: string;
    url: string;
};

const PARAM_KEYS = ['load', 'model', 'splat', 'splatUrl'];

const decodeIfStillEncoded = (value: string) => {
    const trimmed = value.trim();
    if (/^(?:https?:|blob:|data:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
        return trimmed;
    }

    try {
        return decodeURIComponent(trimmed);
    } catch (err) {
        console.warn('[supersplat] Failed to decode param value', value, err);
        return trimmed;
    }
};

const guessFilename = (value: string) => {
    try {
        const clean = value.split(/[?#]/)[0];
        const parts = clean.split(/[/\\]/);
        const last = parts.pop();
        return last && last.length ? last : 'model';
    } catch (e) {
        return 'model';
    }
};

const collectImportTargets = (url: URL): ImportTarget[] => {
    const targets: ImportTarget[] = [];
    const filenameList = url.searchParams.getAll('filename').map(decodeIfStillEncoded);

    url.searchParams.forEach((value, key) => {
        if (!PARAM_KEYS.includes(key)) {
            return;
        }

        const decoded = decodeIfStillEncoded(value);
        if (!decoded) {
            return;
        }

        const filename = targets.length < filenameList.length ?
            filenameList[targets.length] :
            guessFilename(decoded);

        targets.push({
            filename,
            url: decoded
        });
    });

    return targets;
};

const loadFromQueryParams = async (url: URL, events: Events) => {
    const targets = collectImportTargets(url);
    if (!targets.length) {
        return;
    }

    events.fire('funes.loading', true);

    try {
        for (const target of targets) {
            await events.invoke('import', [target]);
        }
    } catch (err) {
        events.fire('funes.loading', false, err);
        throw err;
    }
};

export { collectImportTargets, loadFromQueryParams };
