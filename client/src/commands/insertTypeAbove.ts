import * as vscode from 'vscode';
import * as vscli from 'vscode-languageclient';
import * as vssrv from 'vscode-languageserver-types';
import { EditorUtils } from '../utils/editorUtils';
import { HsDevClient } from '../utils/hsdevClient';

/**
 * Command which inserts a line with the type signature of the function under the cursor
 * If the token under the cursor has no type, cancel the command
 */
export class InsertTypeAbove {

    constructor(private readonly hsdevClient: HsDevClient) {
    }

    public readonly id: string = "hsdev.insertType";

    public handler = () => {
        if (!vscode.window.activeTextEditor) {
            return; // No open text editor
        }
        let editor = vscode.window.activeTextEditor;

        if (!this.hsdevClient.client) {
            return;
        }
        let client = this.hsdevClient.client;

        let docId: vscli.TextDocumentIdentifier = {
            uri: editor.document.uri.toString()
        };
        let hoverParams: vscli.TextDocumentPositionParams = {
            textDocument: docId,
            position: editor.selection.start
        };
        //find type information at cursor position in the right document
        //use the language server with the standard protocol
        client
            .sendRequest("insertTypeAbove", hoverParams)
            .then(
                (hover: unknown) => {
                    if (!hover) {
                        return;
                    }
                    let hover_ = hover as vssrv.Hover;
                    //if the response contains a value field
                    if (hover_ && this.isValued(hover_.contents) && hover_.contents.value !== "") {
                        let signature = hover_.contents.value;
                        editor.edit(this.addSignatureEditBuilder(editor, this.normalizeSignature(signature)));
                    }
                },
                (reason : any) => {
                    client.error("Error while inserting type", reason);
                }
            );
    }


    private normalizeSignature(signature: string) {
        return signature.replace(/[\r\n]+/g, '').replace(/[ ]{2,}/g, ' ');
    }

    private addSignatureEditBuilder(editor: vscode.TextEditor, signature: string) {
        return (editBuilder: vscode.TextEditorEdit) => {
            //find the first char column to align the type signature with the function definition
            let startingColumn = EditorUtils.getFirstSymbolFromCurrentPosition(editor);
            //FIXME: handle 'tab based' documents
            let padding = " ".repeat(startingColumn);
            let signatureLine = padding + signature;
            let currentLine = EditorUtils.getCurrentLine(editor);
            let insertingPosition = new vscode.Position(currentLine.lineNumber, 0);
            //insert the type signature line where the function defintion is located
            editBuilder.insert(insertingPosition, padding + signature + '\n'); //FIXME: potential bug with windows CR/LF
        };
    }

    //true is markedString contains a value field
    private isValued(markedString: { value: string } | string | vscode.MarkedString[]): markedString is { value: string } {
        return (<{ value: string }>markedString).value !== undefined;
    }

}