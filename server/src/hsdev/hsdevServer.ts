import { Log, LogLevel, wrapCallback } from '../debug/debugUtils';

import child_process = require('child_process');
import stream = require('stream');
import os = require('os');


class StreamReader {
    private onLine: (line: string) => void = (line) => {};
    private onClose: () => void = () => {};

    public constructor(
        private handle: stream.Readable
    ) {
        handle.on('data', this.onData);
        handle.on('end', this.onClose);
        handle.on('close', this.onClose);
    }

    public on(event: 'line', cb: (line: string) => void): this;
    public on(event: 'close', cb: () => void): this;
    public on(event: string, cb: any): this {
        switch (event) {
            case 'line': this.onLine = wrapCallback('onLine', cb); break;
            case 'close': this.onClose = wrapCallback('onClose', cb); break;
            default: throw Error(`Invalid event: ${event}`);
        }
        return this;
    }

    private buffer: string = '';

    private onData = (data: Buffer) => {
        let chunk = data.toString();
        let chunks = chunk.split(os.EOL);

        this.buffer += chunks.shift();

        while (chunks.length > 0) {
            this.onLine(this.buffer);
            this.buffer = chunks.shift();
        }
    }
}


export interface ServerOptions {
    port?: number;
    db?: string;
    logFile?: string;
    logLevel?: LogLevel;
}


export class HsDevServer {
    private stdoutReader: StreamReader;
    private stderrReader: StreamReader;
    private proc: child_process.ChildProcess;
    private onStart: () => void = () => {};
    private onStop: () => void = () => {};
    private static levelRx: RegExp = /^.*?\s+(?<level>[A-Z]+)\s+.*$/;
    private static startedRx: RegExp = /^Server started at port (?<port>.*)$/;

    public isAlive: boolean = false;

    public constructor(
        private cmd: string[],
        private options: ServerOptions = {}
    ) {}

    public on(event: 'start', cb: () => void): this;
    public on(event: 'stop', cb: () => void): this;
    public on(event: string, cb: () => void): this {
        switch (event) {
            case 'start': this.onStart = wrapCallback('onStart', cb); break;
            case 'stop': this.onStop = wrapCallback('onStop', cb); break;
        }
        return this;
    }

    public async start(): Promise<void> {
        if (this.proc) {
            Log.debug(`hsdev server already starting or started`);
            return;
        }

        let args: string[] = [...this.cmd];
        args.push('run');
        if (this.options.port) {
            args.push('--port', this.options.port.toString());
        }
        if (this.options.db) {
            args.push('--db', this.options.db);
        }
        if (this.options.logFile) {
            args.push('--log', this.options.logFile);
        }
        if (this.options.logLevel) {
            args.push('--log-level', LogLevel[this.options.logLevel].toLowerCase());
        }
        args.push('--no-color');

        let command = args.shift();
        Log.debug(`Spawning hsdev process: ${command} ${args}`);
        this.proc = child_process.spawn(command, args);

        this.proc.stdout.setEncoding('utf-8');
        this.proc.stderr.setEncoding('utf-8');
        this.proc.setMaxListeners(100);
        this.proc.stdout.setMaxListeners(100);
        this.proc.stderr.setMaxListeners(100);
        this.proc.on('exit', (code, signal) => {
            Log.debug(`hsdev server exited with code: ${code}, and signal: ${signal}`);
            this.clear();
            this.onStop();
        });

        this.stderrReader = new StreamReader(this.proc.stderr);
        this.stderrReader.on('line', (line: string) => {
            let level: LogLevel = LogLevel.INFO;
            let m = HsDevServer.levelRx.exec(line);
            if (m !== null) {
                let groups =  (m as any).groups;
                if (groups && groups.level) {
                    let parsedLevel = LogLevel[groups.level as string];
                    if (parsedLevel) {
                        level = parsedLevel;
                    }
                }
            }
            Log.log(level, line);
        });

        await this
            .serverStarted()
            .catch(reason => {
                Log.warn(`Error starting hsdev server: ${reason}`);
                this.stop();
            })
            .then(() => { this.isAlive = true; this.onStart(); });
    }

    public stop() {
        if (!this.proc) {
            Log.debug(`hsdev server already stopped or stopping`);
            return;
        }

        this.proc.stdin.end();
        this.proc.kill();
    }

    private clear() {
        this.isAlive = false;
        this.proc = null;
        this.stdoutReader = null;
        this.stderrReader = null;
    }

    private serverStarted(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.stdoutReader = new StreamReader(this.proc.stdout);
            this.stdoutReader.on('line', (line: string) => {
                let m = HsDevServer.startedRx.exec(line);
                if (m !== null) {
                    let groups = (m as any).groups;
                    if (groups && groups.port) {
                        Log.info(`Started hsdev server at port ${groups.port}`);
                        resolve();
                    }
                } else {
                    reject(`Unknown response from server: ${line}`);
                }
            });

            setTimeout(
                () => {
                    if (!this.isAlive) {
                        Log.debug(`Unable to start hsdev server`);
                        reject(`Unable to start hsdev server`);
                        this.stop();
                    }
                },
                5000
            );
        });
    }
}
