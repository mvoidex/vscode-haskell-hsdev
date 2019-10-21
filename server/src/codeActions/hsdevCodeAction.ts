import * as vsrv from 'vscode-languageserver';

export interface HsDevCodeAction {
    getCommand(textDocument: vsrv.TextDocumentIdentifier, diag: vsrv.Diagnostic): vsrv.Command;
}