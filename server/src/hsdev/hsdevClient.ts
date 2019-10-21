import { Log, LogLevel, wrapCallback } from '../debug/debugUtils';
import { Result, success, fail } from '../utils/result';
import { SymbolId, Parser, parseList } from './syntaxTypes';
import { HsDevCommand } from './commands/commands';
import { HsDevResponse } from './commands/hsdevResponse';

import * as net from 'net';
import { Disposable } from 'vscode-jsonrpc';


class SocketReader implements Disposable {
    private onLine: (line: string) => void = (line) => {};
    private onClose: () => void = () => {};

    public constructor(
        private sock: net.Socket
    ) {
        sock.on('data', this.onData);
        sock.on('close', this.onClose);
    }
    
    public dispose() {
        this.sock.off('data', this.onData);
        this.sock.off('close', this.onClose);
    }

    public on(event: 'line', cb: (line: string) => void): this;
    public on(event: 'close', cb: () => void): this;
    public on(event: string, cb: any): this {
        switch (event) {
            case 'line': this.onLine = wrapCallback('onLine', cb); break;
            case 'close': this.onClose = wrapCallback('onClose', cb); break;
            default: throw Error(`Unknown event type: ${event}`);
        }
        return this;
    }

    private buffer: string = '';

    private onData = (data: Buffer) => {
        let chunk = data.toString();
        let chunks = chunk.split('\n');

        this.buffer += chunks.shift();

        while (chunks.length > 0) {
            this.onLine(this.buffer);
            this.buffer = chunks.shift();
        }
    }
}


export interface ClientOptions {
    host?: string;
    port?: number;
    timeout?: number;
}


export interface Callbacks<R> {
    onError?: (error: string, details: any) => void;
    onNotify?: (notify: any) => void;
    onResult?: (result: R) => void;
}


function parseResult<R>(parse: Parser<R>, cbs: Callbacks<R>): Callbacks<any> {
    return {
        onError: cbs.onError,
        onNotify: cbs.onNotify,
        onResult: (result: any) => {
            parse(result).fold(
                (v) => { if (cbs.onResult) { cbs.onResult(v); } },
                (err: string, details?: any) => { if (cbs.onError) { cbs.onError(err, details); } }
            );
        }
    };
}


export type SearchType = 'exact' | 'prefix' | 'infix' | 'suffix';
export interface Query {
    query: string;
    searchType?: SearchType;
    header?: boolean;
}
export interface QueryFilters {
    project?: string;
    file?: string;
    module?: string;
    package?: string;
    installed?: boolean;
    sources?: boolean;
    standalone?: boolean;
}


export class HsDevClient implements Disposable {
    private sock: net.Socket;
    private sockReader: SocketReader;
    private onConnect: () => void = () => {};
    private onDisconnect: () => void = () => {};
    private onResult: (id: string | null, result: any) => void = (id, result) => {};
    private onError: (id: string | null, error: string, details?: any) => void = (id, error, details) => {};
    private onNotify: (id: string | null, notify: any) => void = (id, notify) => {};
    private onMessage: (id: string | null, message: any) => void = (id, message) => {};
    private onLine: (line: string) => void = (line) => {};
    private id: number = 0;
    private callbacks: {[id: string]: Callbacks<any>} = {};
    
    public isConnected: boolean = false;

    public constructor(
        private options: ClientOptions = {}
    ) {}

    public dispose() {
        this.disconnect();
    }

    public on(event: 'connect', cb: () => void): this;
    public on(event: 'disconnect', cb: () => void): this;
    public on(event: 'result', cb: (result: any) => void): this;
    public on(event: 'error', cb: (error: string, details?: any) => void): this;
    public on(event: 'notify', cb: (notify: any) => void): this;
    public on(event: 'message', cb: (id: string | null, message: any) => void): this;
    public on(event: 'line', cb: (line: string) => void): this;
    public on(event: string, cb: any): this {
        switch (event) {
            case 'connect': this.onConnect = wrapCallback('onConnect', cb); break;
            case 'disconnect': this.onDisconnect = wrapCallback('onDisconnect', cb); break;
            case 'result': this.onResult = wrapCallback('onResult', cb); break;
            case 'error': this.onError = wrapCallback('onError', cb); break;
            case 'notify': this.onNotify = wrapCallback('onNotify', cb); break;
            case 'message': this.onMessage = wrapCallback('onMessage', cb); break;
            case 'line': this.onLine = wrapCallback('onLine', cb); break;
            default: throw new Error(`Unknown event type: ${event}`);
        }
        return this;
    }

    public connect(): Promise<void> {
        if (this.sock) {
            Log.debug(`hsdev client already connected or connecting`);
            return;
        }
        Log.debug(`connecting hsdev client`);
        this.sock = new net.Socket();
        this.sock.setEncoding('utf-8');

        return new Promise<void>((resolve, reject) => {
            this.sock.on('connect', () => {
                this.isConnected = true;
                this.onConnect();
                resolve();
            });

            setTimeout(
                () => {
                    if (!this.isConnected) {
                        Log.debug(`Still not connected, dropping`);
                        reject(`Connection timeout`);
                        this.disconnect();
                    }
                },
                5000
            );
    
            this.sockReader = new SocketReader(this.sock);
            this.sockReader.on('line', this.parseResponse);
            this.sockReader.on('close', () => {
                Log.debug(`disconnected from hsdev server`);
                this.clear();
                this.onDisconnect();
            });
    
            this.sock.connect(this.options.port || 4567, this.options.host);
        });
    }

    public disconnect(): void {
        if (!this.sock) {
            Log.debug(`hsdev client already disconnected or disconnecting`);
            return;
        }
        Log.debug(`disconnecting hsdev client`);
        this.sock.end();
    }

    public async call(
        command: string,
        opts: {[name: string]: any} = {},
        callbacks?: Callbacks<any>
    ): Promise<any> {
        const sock = this.sock;
        if (!sock) {
            Log.warn(`hsdev client not connected`);
        }
        let cmd = opts;
        const id = this.id.toString();
        ++this.id;
        opts['command'] = command;
        opts['no-file'] = true;
        opts['id'] = id;
        return await new Promise<any>((resolve, reject) => {
            const cbs: Callbacks<any> = {
                onError: (error: string, details: any) => {
                    reject(`Error returned: ${error}`);
                    if (callbacks && callbacks.onError) {
                        callbacks.onError(error, details);
                    }
                },
                onNotify: callbacks ? callbacks.onNotify : null,
                onResult: (result: any) => {
                    resolve(result);
                    if (callbacks && callbacks.onResult) {
                        callbacks.onResult(result);
                    }
                }
            };
            this.callbacks[id] = cbs;
            sock.write(JSON.stringify(cmd) + '\n');
        });
    }

    public async invoke<R>(command: HsDevCommand<R>, callbacks?: Callbacks<R>): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            let cbs: Callbacks<R> = {
                onResult: (result: R) => {
                    resolve(result);
                    if (callbacks && callbacks.onResult) {
                        callbacks.onResult(result);
                    }
                },
                onError: (error, details?) => {
                    reject(error);
                    if (callbacks && callbacks.onError) {
                        callbacks.onError(error, details);
                    }
                },
                onNotify: callbacks ? callbacks.onNotify : undefined
            };
            this.call(command.command, command.serialize(), parseResult<R>(command.parseResponse, cbs));
        });
    }

    // public async ping(callbacks?: Callbacks<void>): Promise<void> {
    //     await this.call('ping', {}, callbacks);
    // }

    // public async whoat(
    //     file: string,
    //     line: number,
    //     column: number,
    //     callbacks?: Callbacks<SymbolId[]>
    // ): Promise<void> {
    //     await this.call('whoat', {'file': file, 'line': line, 'column': column}, parseResult<SymbolId[]>(parseList(SymbolId.parse), callbacks));
    // }

    private parseResponse = (line: string) => {
        try {
            this.onLine(line);

            let msg = JSON.parse(line);
            let msgId: string | null = null;
            if (msg.id) {
                msgId = msg.id;
                delete msg.id;
            }
            this.onMessage(msgId, msg);

            let cbs = this.callbacks[msgId];

            if ('notify' in msg) {
                let notify = msg.notify;
                if (cbs.onNotify) {
                    cbs.onNotify(notify);
                }
                this.onNotify(msgId, notify);
            } else if ('result' in msg) {
                let result = msg.result;
                if (cbs.onResult) {
                    cbs.onResult(result);
                }
                delete this.callbacks[msgId];
                this.onResult(msgId, result);
            } else if ('error' in msg) {
                let error = msg.error as string;
                delete msg.error;
                if (cbs.onError) {
                    cbs.onError(error, msg);
                }
                delete this.callbacks[msgId];
                this.onError(msgId, error, msg);
            } else {
                Log.warn(`Unknown response type from server: ${line}`);
            }
        } catch (e) {
            Log.warn(`invalid response from hsdev server: ${line}, error: ${e}`);
        }
    }

    private clear() {
        this.isConnected = false;
        this.sock = null;
        this.sockReader.dispose();
        this.sockReader = null;
        this.id = 0;
    }
}