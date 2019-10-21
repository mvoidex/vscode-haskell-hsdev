'use strict';

import * as vsrv from 'vscode-languageserver';
import { DebugUtils, Log } from './debug/debugUtils';
import { HsDevService } from './hsdevService';
import { UriUtils } from './utils/uriUtils';
import { HsDevSettings } from './hsdevSettings';
import { CodeActionService } from "./codeActions/codeActionService";
import { TypeInfoKind } from './hsdev/commands/commands';
import { CommandsService } from "./commands/commandsService";
import { Symbol } from './hsdev/syntaxTypes';
import * as features from "./features";
import { HsDevServer } from './hsdev/hsdevServer';
import { HsDevClient } from './hsdev/hsdevClient';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: vsrv.IConnection = vsrv.createConnection(new vsrv.IPCMessageReader(process), new vsrv.IPCMessageWriter(process));
const debugEnabled: boolean = true;
DebugUtils.init(debugEnabled, connection); // debug enabled

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: vsrv.TextDocuments = new vsrv.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let hsdevService = new HsDevService();

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
let workspaceRoot: string;
connection.onInitialize((params): Promise<vsrv.InitializeResult> => {
    Log.trace('onInitialize');
    workspaceRoot = params.rootPath;
    return hsdevService.initialize(connection, params.initializationOptions.settings, params.initializationOptions.targets);
});

connection.onShutdown(() => {
    if (hsdevService) {
        hsdevService.dispose();
        hsdevService = null;
    }
});

connection.onExit(() => {
    if (hsdevService) {
        hsdevService.dispose();
        hsdevService = null;
    }
});

connection.onRequest("changeTargets", (targets: string[]): Promise<string> => {
    return hsdevService.changeTargets(targets)
        .then((msg) => {
            documents.all().forEach((doc) => hsdevService.validateTextDocument(connection, doc));
            return Promise.resolve(msg);
        });
});

connection.onRequest("insertTypeAbove", (documentInfo): Promise<Symbol> => {
    const documentURI = documentInfo.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getHoveredSymbol(textDocument, documentInfo.position, TypeInfoKind.Generic);
    }
});

connection.onExecuteCommand((exeCmdParams: vsrv.ExecuteCommandParams): void => {
    let cmd = CommandsService.getCommandInstance(exeCmdParams);
    if (!cmd) {
        console.log("Unknown command : ");
        console.dir(exeCmdParams);
        return null;
    }
    cmd.execute(connection.workspace, documents, hsdevService);
});

documents.onDidOpen((event): Promise<void> => {
    return hsdevService.validateTextDocument(connection, event.document);
});

connection.onInitialized((initializedParams: vsrv.InitializedParams) => {
    hsdevService.onInitialized();
});

// The settings have changed.
// Is sent on server activation as well.
connection.onDidChangeConfiguration((change) => {
    let settings = change.settings as HsDevSettings;
    DebugUtils.instance.isDebugOn = debugEnabled;
    return hsdevService.changeSettings(settings)
        .then((msg) => {
            documents.all().forEach((doc) => hsdevService.validateTextDocument(connection, doc));
        })
        .catch(reason => {
            // A DidChangeConfiguration request doesn't have a response so we use showErrorMessage
            // to show an error message
            connection.window.showErrorMessage("Error while loading HsDev configuration: " + reason);
        });
});

connection.onDefinition((documentInfo): Promise<vsrv.Location> => {
    const documentURI = documentInfo.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getDefinitionLocation(textDocument, documentInfo.position);
    }
});

connection.onDocumentSymbol((documentInfo): Promise<vsrv.SymbolInformation[]> => {
    const documentURI = documentInfo.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getModuleDefinitions(textDocument);
    }
});

connection.onWorkspaceSymbol((workspaceInfo): Promise<vsrv.SymbolInformation[]> => {
    return hsdevService.getDefinitions();
});

connection.onHover((documentInfo): Promise<vsrv.Hover> => {
    const documentURI = documentInfo.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getHoverInformation(textDocument, documentInfo.position, TypeInfoKind.Instanciated);
    }
});

connection.onCompletion((documentInfo: vsrv.TextDocumentPositionParams): Promise<vsrv.CompletionItem[]> => {
    const documentURI = documentInfo.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getCompletionItems(textDocument, documentInfo.position);
    }
});

connection.onCompletionResolve((item: vsrv.CompletionItem) => {
    return hsdevService.getResolveInfos(item);
});

connection.onReferences((referenceParams: vsrv.ReferenceParams): Promise<vsrv.Location[]> => {
    const documentURI = referenceParams.textDocument.uri;
    if (UriUtils.isFileProtocol(documentURI)) {
        const textDocument = documents.get(documentURI);
        return hsdevService.getReferencesLocations(textDocument, referenceParams.position);
    }
});

/**
 * Code action lifecycle:
 *  - a bunch of diagnostics are sent from the server to the client (errors, warings, etc)
 *  - each diagnostic is a candidate for a codeAction
 *  - each time the user is hovering a range of code where diagnosics are attached (warning, error, etc.) a codeAction request is sent
 *    from the client to the server (ie : this very function is executed) with all the diagnotics for this range of code sent as parameters
 *  - the codeAction request needs a response containing one or several commands with unique ID and custom parameters
 *  - the title of the commands are displayed to the user, next to the line
 *  - when the user clicks on a command, a commandRequest is sent to the server with the command id and custom parameters
 *  - the onExecuteCommand function is executed with the command id/parameters and a WorkspaceEdit response is sent back to the client
 *    to modify corresponding files
 */
connection.onCodeAction((params: vsrv.CodeActionParams): vsrv.Command[] => {
    let CAs = CodeActionService.CodeActions;
    return params.context.diagnostics
        .map(diag =>
            CAs.map(codeAction =>
                codeAction.getCommand(params.textDocument, diag)
            ))
        .reduce((accu, commands) => accu.concat(commands), []) //flatten commands[][] to commands[]
        .filter(c => c !== null);
});

connection.onRenameRequest(features.rename(documents, hsdevService));


documents.onDidSave(e => {
    return hsdevService.validateTextDocument(connection, e.document);
});

// Listen on the connection
connection.listen();