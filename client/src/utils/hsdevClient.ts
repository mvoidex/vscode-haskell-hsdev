import * as path from 'path';
import * as vscode from 'vscode';
import * as vscli from 'vscode-languageclient';
import * as stack from './stack';
import { HsDevTargets } from './targets';

export enum LogLevel {
    TRACE = 0,
    DEBUG,
    INFO,
    WARN,
    ERROR,
    FATAL
}

export interface ClientOptions {
    host?: string;
    port?: number;
    timeout?: number;
}

export interface ServerOptions {
    port?: number;
    db?: string;
    logFile?: string;
    logLevel?: LogLevel;
}

export interface HsDevSettings {
    clientOptions?: ClientOptions;
    serverOptions?: ServerOptions;
    stackPath: string;
    hsdevPath: string;
}

export interface HsDevClientInitOptions {
    settings: HsDevSettings;
    targets: string[];
}

export class HsDevClient implements vscode.Disposable {

    private targets: HsDevTargets | null = null;

    private _client: vscli.LanguageClient | null = null;
    public get client(): vscli.LanguageClient | null {
        return this._client;
    }

    private disposable: vscode.Disposable | null = null;

    // The debug options for the server
    private readonly debugOptions = { execArgv: [] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    private readonly serverOptions: vscli.ServerOptions;

    // Options to control the language client
    private readonly clientOptions: vscli.LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: ['haskell'],
        synchronize: {
            // Synchronize the setting section 'hsdev' to the server
            configurationSection: 'hsdev'
            //     // Notify the server about file changes to '.clientrc files contain in the workspace
            //     fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        },

        //using a callback here because LanguageClient detects if initializationOptions is a func and call it
        //thanks to this trick, we can change initOptions AFTER the LanguageClient instanciation
        //(usefull for changing cabals targets when LanguageClient has stoped working on an invalid target)
        initializationOptions: () => {
            return HsDevClient.initOptions;
        }
    };

    private static initOptions: HsDevClientInitOptions;

    constructor(serverModule: string, private readonly debug: boolean) {
        // The debug options for the server
        let debugOptions = { execArgv: [] };

        this.serverOptions = {
            run: { module: serverModule, transport: vscli.TransportKind.ipc },
            debug: { module: serverModule, transport: vscli.TransportKind.ipc , options: debugOptions }
            //remove options here otherwise we experience node socket error msg
        };
    }

    public start(initOptions: HsDevClientInitOptions): vscode.Disposable {
        HsDevClient.initOptions = initOptions;
        this._client = new vscli.LanguageClient('haskell-hsdev', 'haskell-hsdev', this.serverOptions, this.clientOptions, this.debug);
        this.disposable = this._client.start();
        return this;
    }

    public getTargets(): Promise<HsDevTargets> {
        if (this.targets === null) {
            return stack
                .getTargets(HsDevClient.initOptions.settings.stackPath)
                .then(targets => {
                    this.targets = targets;
                    return Promise.resolve(targets);
                }).catch(reason => {
                    if (reason.message.indexOf("Invalid argument", 0) > -1) {
                        const stackmsg = "Stack version is too low for the change targets feature. Update stack (min version = 1.2.0)";
                        reason.message = stackmsg + "\r\n\r\n" + reason.message;
                        vscode.window.showErrorMessage(stackmsg);
                    }
                    if (this._client) {
                        this._client.error('Error loading stack targets: ' + reason.message);
                    }
                    return Promise.reject(reason);
                });
        } else {
            return Promise.resolve(this.targets);
        }
    }

    public dispose() {
        if (this.disposable) {
            this.disposable.dispose();
            this._client = null;
        }
    }
}
