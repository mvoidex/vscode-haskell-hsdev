import { ClientOptions } from  './hsdev/hsdevClient';
import { ServerOptions } from './hsdev/hsdevServer';

export interface HsDevSettings {
    clientOptions?: ClientOptions;
    serverOptions?: ServerOptions;
    stackPath: string;
}

export function settingsUpdated<T>(current: T, updated: T): boolean {
    let keys = new Set<string>(Object.keys(current).concat(Object.keys(updated)));
    return Array
        .from<string>(keys.keys())
        .map((key) => key in current && key in updated && JSON.stringify(current[key]) === JSON.stringify(updated[key]))
        .reduce((x, y) => x && y);
}
