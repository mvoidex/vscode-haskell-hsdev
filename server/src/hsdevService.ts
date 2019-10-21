'use strict';

import * as vsrv from 'vscode-languageserver';
import * as uuid from 'node-uuid';
import * as tmp from 'tmp';
import * as fs from 'fs';
import * as net from 'net';

import { HsDevDiagnostic, HsDevDiagnosticKind } from './hsdev/commands/hsdevDiagnostic';
import { DocumentUtils, WordSpot, NoMatchAtCursorBehaviour } from './utils/documentUtils';
import { UriUtils } from './utils/uriUtils';
import { DebugUtils, Log, LogLevel } from './debug/debugUtils';
import { Features } from './features/features';
import { CompletionUtils } from './completionUtils';
import { HsDevSettings, settingsUpdated } from './hsdevSettings';
import { HsDevCommand, TypeInfoKind, Ping, Whoat, Exit, Scan, ProjectTarget, BuildTool, FileTarget, Complete, InferTypes, FindUsages, CheckLint } from "./hsdev/commands/commands";
import { HsDevServer } from './hsdev/hsdevServer';
import { HsDevClient } from './hsdev/hsdevClient';
import { Symbol, SymbolId, SymbolType, FileLocation } from './hsdev/syntaxTypes';
import { uriToFilePath } from 'vscode-languageserver/lib/files';

const serverCapabilities: vsrv.InitializeResult = {
    capabilities: {
        // Tell the client that the server works in FULL text document sync mode
        textDocumentSync: vsrv.TextDocumentSyncKind.Full,
        // // support type info on hover
        // hoverProvider: true,
        // // support goto definition
        // definitionProvider: true,
        // // support find usage (ie: find all references)
        // referencesProvider: true,
        // // Tell the client that the server support code complete
        // completionProvider: {
        //     // doesn't support completion details
        //     resolveProvider: true
        // }
    }
};

/**
 * Exposes all haskell-hsdev capabilities to the server
 */
export class HsDevService {
    private hsdevServer: HsDevServer;
    private hsdevClient: HsDevClient;
    private connection: vsrv.IConnection;
    private features: Features;
    private initializationOk: boolean;
    private hsdevNotFound = "Executable named hsdev not found";
    private settings: HsDevSettings;
    private currentTargets: string[];


    public async initialize(connection: vsrv.IConnection, settings: HsDevSettings, targets: string[]): Promise<vsrv.InitializeResult> {
        Log.init(connection, LogLevel.TRACE);
        Log.info(`Initializing haskell hsdev`);

        this.hsdevServer = new HsDevServer([settings.stackPath, 'exec', '--', 'hsdev'], settings.serverOptions);
        this.hsdevClient = new HsDevClient(settings.clientOptions);
        this.settings = settings;
        this.connection = connection;
        this.features = new Features(connection);
        this.currentTargets = targets;

        this.hsdevServer.on('start', () => { Log.info('hsdev server started'); });
        this.hsdevServer.on('stop', () => { Log.info('hsdev server stopped'); });
        this.hsdevClient.on('connect', () => { Log.info('hsdev client connected'); });
        this.hsdevClient.on('disconnect', () => { Log.info('hsdev client disconnected'); });

        try {
            await this.startHsDevAndHandleErrors(targets);

            //server capabilities are sent later with a client/registerCapability request (just send the document sync capability here)
            //see onInitialized method
            this.initializationOk = true;
            return serverCapabilities;
        }
        catch (e) {
            this.initializationOk = false;
            throw e;
        }
    }

    public onInitialized() {
        if (this.initializationOk) {
            this.features.registerAllFeatures();
            this.scanWorkspace();
            Log.info(`haskell hsdev initialized`);
        }
        else {
            Log.info(`haskell hsdev initialization failed`);
        }
    }

    private async startHsDevAndHandleErrors(targets: string[]): Promise<void> {
        // Launch the hsdev process
        try {
            await this.hsdevServer.start();
            await this.hsdevClient.connect();
            return;
        } catch (reason) {
            throw <vsrv.InitializeError>({
                code: 1,
                message: reason,
                retry: false,
                data: { retry: false }
            });
        }
    }


    private scanWorkspace() {
        // let paths = workspace.workspaceFolders
        //     .map(f => UriUtils.toFilePath(f.uri.path))
        //     .filter(p => p !== null);
        // Log.info(`Will search projects in directories: ${paths.join(', ')}`);
        // paths.forEach(p => {
        //     let cmd = new Scan(new ProjectTarget(p, BuildTool.Stack, true));
        //     Log.info(`inspecting project ${p}`);
        //     this.hsdevClient.invoke(cmd, {
        //         onError: (error, details?) => { Log.error(`error inspecing project ${p}: ${details}`); },
        //         onNotify: (notify) => {},
        //         onResult: () => { Log.info(`project ${p} inspected`); }
        //     });
        // });
    }


    public async changeTargets(targets: string[]): Promise<string> {
        const prettyString = (ts) => {
            if (ts.length === 0) {
                return "default targets";
            }
            else {
                return `${ts.join(' ')}`;
            }
        };

        this.connection.console.log('Restarting hsdev with targets: ' + prettyString(targets));
        try {
            await this.startHsDevAndHandleErrors(targets);
            Log.info(`Restart done.`);
            this.features.registerAllFeatures();
            this.currentTargets = targets;
            return 'HsDev restarted with targets: ' + prettyString(targets);
        }
        catch (reason) {
            this.features.unregisterAllFeatures();
            throw reason.message;
        }
    }

    public async changeSettings(newSettings: HsDevSettings): Promise<string> {
        if (settingsUpdated<HsDevSettings>(this.settings, newSettings)) {
            this.settings = newSettings;
            return await this.changeTargets(this.currentTargets);
        } else {
            this.settings = newSettings;
            return "Settings updated";
        }
    }

    public async getDefinitionLocation(textDocument: vsrv.TextDocument, position: vsrv.Position): Promise<vsrv.Location> {
        if (!this.hsdevClient || !this.hsdevClient.isConnected) {
            return null;
        }

        let wordRange = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.Stop);
        let cmd = new Whoat(position.line + 1, position.character + 1, UriUtils.toFilePath(textDocument.uri));
        let syms = await this.hsdevClient.invoke(cmd, {
            onError: (error: string, details?: any) => { Log.error(`error invoking whoat: ${error}, ${details}`); },
            onNotify: (notify: any) => {},
            onResult: (result: Symbol[]) => {
                Log.debug(`whoat returned: ${syms.map((s) => s.name).join(', ')}`);
            }
        });
        if (syms && syms.length > 0) {
            let sym = syms[0];
            if (sym.position) {
                let pos = vsrv.Position.create(sym.position.line - 1, sym.position.column - 1);
                let srcFile = sym.module.location as FileLocation;
                let loc = vsrv.Location.create(
                    UriUtils.toUri(srcFile.filename),
                    vsrv.Range.create(pos, pos)
                );
                return loc;
            } else {
                return null;
            }
        }
        return null;
    }

    public async getHoveredSymbol(textDocument: vsrv.TextDocument, position: vsrv.Position, infoKind: TypeInfoKind): Promise<Symbol> {
        if (!this.hsdevClient || !this.hsdevClient.isConnected) {
            return null;
        }

        let wordRange = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.Stop);
        if (!wordRange.isEmpty) {
            let cmd = new Whoat(wordRange.range.start.line + 1, wordRange.range.start.character + 1, UriUtils.toFilePath(textDocument.uri));
            let syms = await this.hsdevClient.invoke(cmd).catch(e => {
                Log.error(`invoking 'whoat' fails with: ${e}`);
            });
            if (syms && syms.length > 0) {
                return syms.shift();
            }
        } else {
            return null;
        }
    }

    public async getHoverInformation(textDocument: vsrv.TextDocument, position: vsrv.Position, infoKind: TypeInfoKind): Promise<vsrv.Hover> {
        if (!this.hsdevClient || !this.hsdevClient.isConnected) {
            return null;
        }

        let wordRange = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.Stop);
        if (!wordRange.isEmpty) {
            let cmd = new Whoat(wordRange.range.start.line + 1, wordRange.range.start.character + 1, UriUtils.toFilePath(textDocument.uri));
            let syms = await this.hsdevClient.invoke(cmd).catch(e => {
                Log.error(`invoking 'whoat' fails with: ${e}`);
            });
            if (syms && syms.length > 0) {
                let sym = syms.shift();
                let  symbolInfo: vsrv.MarkedString = { language: 'haskell', value: sym.detailed() };
                let hover: vsrv.Hover = { contents: symbolInfo };
                return hover;
            }
        } else {
            return null;
        }
    }

    public getCompletionItems(textDocument: vsrv.TextDocument, position: vsrv.Position): Promise<vsrv.CompletionItem[]> {
        const currentLine = DocumentUtils.getPositionLine(textDocument, position);
        if (currentLine.startsWith("import ")) {
            return CompletionUtils.getImportCompletionItems(this.hsdevClient, textDocument, position, currentLine);
        }
        else {
            return CompletionUtils.getDefaultCompletionItems(this.hsdevClient, textDocument, position);
        }
    }

    public getResolveInfos(item: vsrv.CompletionItem): Promise<vsrv.CompletionItem> {
        return CompletionUtils.getResolveInfos(this.hsdevClient, item);
    }

    public async getReferencesLocations(textDocument: vsrv.TextDocument, position: vsrv.Position): Promise<vsrv.Location[]> {
        if (!this.hsdevClient || !this.hsdevClient.isConnected) {
            return null;
        }
        let wordRange = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.Stop);
        let cmd = new FindUsages(wordRange.range.start.line + 1, wordRange.range.start.character + 1, UriUtils.toFilePath(textDocument.uri));
        let usages = await this.hsdevClient.invoke(cmd).catch(err => {
            Log.error(`Error finding usages: ${err}`);
        });
        if (usages) {
            return usages.map(u => vsrv.Location.create(
                UriUtils.toUri((u.usedIn.location as FileLocation).filename),
                vsrv.Range.create(
                    vsrv.Position.create(u.usedRegion.start.line - 1, u.usedRegion.start.column - 1),
                    vsrv.Position.create(u.usedRegion.end.line - 1, u.usedRegion.end.column - 1)
                )
            ));
        } else {
            return null;
        }
    }

    public async validateTextDocument(connection: vsrv.IConnection, textDocument: vsrv.TextDocumentIdentifier): Promise<void> {
        DebugUtils.instance.connectionLog("validate : " + uriToFilePath(textDocument.uri));

        if (!this.hsdevClient || !this.hsdevClient.isConnected) {
            return;
        }
        let file = UriUtils.toFilePath(textDocument.uri);
        await this.hsdevClient.invoke(new Scan(new FileTarget(file, BuildTool.Stack, true, true)), {
            onError: (error, details?) => { Log.error(`error inspecting file ${file}: ${details}`); },
            onNotify: (notify) => {},
            onResult: () => { Log.info(`file ${file} inspected`); }
        });
        this.hsdevClient.invoke(new InferTypes([], [file]), {
            onError: (error, details?) => { Log.error(`error inferring types for ${file}: ${details}`); },
            onNotify: (notify) => {},
            onResult: () => { Log.info(`inferred types for ${file}`); }
        });
        this.hsdevClient.invoke(new CheckLint([UriUtils.toFilePath(textDocument.uri)]), {
            onError: (error, details?) => { Log.error(`error checking for ${file}: ${details}`); },
            onNotify: (notify) => {},
            onResult: (result: any[]) => {
                this.sendAllDocumentsDiagnostics(this.connection, result);
            }
        });
    }

    private sendAllDocumentsDiagnostics(connection: vsrv.IConnection, hsdevDiags: any[]) {
        //map the hsdevDiag to a vsCodeDiag and add it to the map of grouped diagnostics
        let addToMap = (accu: Map<string, vsrv.Diagnostic[]>, hsdevDiag: any): Map<string, vsrv.Diagnostic[]> => {
            let uri = UriUtils.toUri(hsdevDiag.source.file);
            let vsCodeDiag = this.hsdevDiagToVScodeDiag(hsdevDiag);
            if (accu.has(uri)) {
                accu.get(uri).push(vsCodeDiag);
            }
            else {
                let vsCodeDiags = new Array<vsrv.Diagnostic>();
                vsCodeDiags.push(vsCodeDiag);
                accu.set(uri, vsCodeDiags);
            }
            return accu;
        };

        //group diag by uri
        let groupedDiagnostics = hsdevDiags.reduce<Map<string, vsrv.Diagnostic[]>>(addToMap, new Map<string, vsrv.Diagnostic[]>());

        groupedDiagnostics.forEach((diags, documentUri) => {
            connection.sendDiagnostics({ uri: documentUri, diagnostics: diags });
        });
    }

    private hsdevDiagToVScodeDiag(hsdevDiag: any): vsrv.Diagnostic {
        return {
            severity: hsdevDiag.level === 2 ? vsrv.DiagnosticSeverity.Error : vsrv.DiagnosticSeverity.Warning,
            range: {
                start: { line: hsdevDiag.region.from.line - 1, character: hsdevDiag.region.from.column - 1 },
                end: { line: hsdevDiag.region.to.line - 1, character: hsdevDiag.region.to.column - 1 }
            },
            message: hsdevDiag.note.message,
            source: 'hs'
        };
    }

    private sendDocumentDiagnostics(connection: vsrv.IConnection, hsdevDiags: HsDevDiagnostic[], documentUri: string) {
        let diagnostics: vsrv.Diagnostic[] = [];
        diagnostics = hsdevDiags.map(this.hsdevDiagToVScodeDiag);
        connection.sendDiagnostics({ uri: documentUri, diagnostics });
    }
}
