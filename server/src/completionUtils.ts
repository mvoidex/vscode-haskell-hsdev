import * as vsrv from 'vscode-languageserver';
import { HsDevClient } from './hsdev/hsdevClient';
import { DocumentUtils, WordSpot, NoMatchAtCursorBehaviour } from './utils/documentUtils';
import { SymbolType, Module } from './hsdev/syntaxTypes';
import { zipWith } from './utils/functionalUtils';
import { Complete, InfoModule, SearchQuery, SearchType, TargetType } from './hsdev/commands/commands';
import { UriUtils } from './utils/uriUtils';
import { Log } from './debug/debugUtils';

/**
 * Handle completion special cases (import, dot notation, etc.)
 */
export class CompletionUtils {

    private static toCompletionType(kind: SymbolType) {
        switch (kind) {
            case SymbolType.Function: return vsrv.CompletionItemKind.Function;
            case SymbolType.Method: return vsrv.CompletionItemKind.Function;
            case SymbolType.Selector: return vsrv.CompletionItemKind.Function;
            case SymbolType.PatSelector: return vsrv.CompletionItemKind.Function;
            case SymbolType.Constructor: return vsrv.CompletionItemKind.Function;
            case SymbolType.Type: return vsrv.CompletionItemKind.Interface;
            case SymbolType.NewType: return vsrv.CompletionItemKind.Enum;
            case SymbolType.Data: return vsrv.CompletionItemKind.Enum;
            case SymbolType.Class: return vsrv.CompletionItemKind.Class;
            case SymbolType.TypeFam: return vsrv.CompletionItemKind.Class;
            case SymbolType.DataFam: return vsrv.CompletionItemKind.Class;
            case SymbolType.PatConstructor: return vsrv.CompletionItemKind.Interface;
        }
    }

    public static async getImportCompletionItems(hsdevClient: HsDevClient, textDocument: vsrv.TextDocument, position: vsrv.Position, line: string): Promise<vsrv.CompletionItem[]> {
        return [];
        //if the cursor is after a " as " text, it means that we are in the 'name' area of an import, so we disable module autocompletion
        // if (!DocumentUtils.leftLineContains(textDocument, position, " as ")) {
        //     let { word, range } = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.LookLeft);
        //     const lineToComplete = line.substring(0, position.character);
        // }
        // else {
        //     return [];
        // }
    }

    public static async getDefaultCompletionItems(hsdevClient: HsDevClient, textDocument: vsrv.TextDocument, position: vsrv.Position): Promise<vsrv.CompletionItem[]> {
        if (!hsdevClient || !hsdevClient.isConnected) {
            return [];
        }
        let completions: vsrv.CompletionItem[] = [];

        let { word, range } = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.LookLeft);
        let { qualifier, name } = DocumentUtils.getQualifiedSymbol(word);
        let prefix = qualifier ? `${qualifier}.` : '';
        let completeCmd = new Complete(prefix, UriUtils.toFilePath(textDocument.uri), false);
        let suggestions = await hsdevClient.invoke(completeCmd).catch<null>(err => {
            Log.warn(`Error getting completions: ${err}`);
            return null;
        });
        if (suggestions !== null) {
            suggestions.forEach(sugg => completions.push({
                label: sugg.scopeName(),
                kind: CompletionUtils.toCompletionType(sugg.symbolType),
                detail: sugg.brief(),
                documentation: sugg.docs,
                insertText: sugg.scopeName().substr(prefix.length)
            }));
        }

        let infoCmd = new InfoModule(new SearchQuery(), [
            {target: TargetType.File, name: UriUtils.toFilePath(textDocument.uri)}
        ]);
        let moduleInfo = await hsdevClient.invoke(infoCmd).catch<null>(err => {
            Log.warn(`Error getting info module: ${err}`); return null;
        }) as Module[];
        if (moduleInfo && moduleInfo.length > 0) {
            let m = moduleInfo.shift();
            m.imports.forEach(im => completions.push({
                label: im.scopeName(),
                kind: vsrv.CompletionItemKind.Module,
                insertText: im.scopeName().substr(prefix.length)
            }));
        }

        return completions;
    }

    public static async getResolveInfos(hsdevClient: HsDevClient, item: vsrv.CompletionItem): Promise<vsrv.CompletionItem> {
        return item;
    }
}