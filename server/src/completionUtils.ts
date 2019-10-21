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

    private static truncResp(word: string, completion: string) {
        let i = word.length - 1;
        let leftDotIdx = -1;
        while (leftDotIdx < 0 && i >= 0) {
            if (completion[i] === '.') {
                leftDotIdx = i;
            }
            else {
                i--;
            }
        }

        if (leftDotIdx < 0) {
            return completion;
        }
        else {
            return completion.substr(leftDotIdx + 1);
        }
    }

    public static async getImportCompletionItems(hsdevClient: HsDevClient, textDocument: vsrv.TextDocument, position: vsrv.Position, line: string): Promise<vsrv.CompletionItem[]> {
        return [];
        //if the cursor is after a " as " text, it means that we are in the 'name' area of an import, so we disable module autocompletion
        // if (!DocumentUtils.leftLineContains(textDocument, position, " as ")) {
        //     let { word, range } = DocumentUtils.getIdentifierAtPosition(textDocument, position, NoMatchAtCursorBehaviour.LookLeft);
        //     const lineToComplete = line.substring(0, position.character);
        //     const completeRequest = new CompleteRequest(textDocument.uri, lineToComplete);

        //     let response = await completeRequest.send(hsdevClient);
        //     return response.completions.map(completion => {
        //         return {
        //             label: CompletionUtils.truncResp(word, completion),
        //             kind: vsrv.CompletionItemKind.Module
        //         };
        //     });
        // }
        // else {
        //     return [];
        // }
    }

    public static async getDefaultCompletionItems(hsdevClient: HsDevClient, textDocument: vsrv.TextDocument, position: vsrv.Position, maxInfoRequests: number): Promise<vsrv.CompletionItem[]> {
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
        // const completeAtRequest = new CompleteAtRequest(textDocument.uri, DocumentUtils.toHsDevRange(range), word);

        // //First, get all completion texts
        // let response = await completeAtRequest.send(hsdevClient);
        // let completions = response.completions;

        // if (completions.length < 1) {
        //     const completeRequest = new CompleteRequest(textDocument.uri, word);
        //     let completeResp = await completeRequest.send(hsdevClient);
        //     completions = completeResp.completions;
        // }
        // //Then for each text, get its type informations

        // return Promise.all(
        //     completions.map(async (completion, idx): Promise<vsrv.CompletionItem> => {
        //         if (idx < maxInfoRequests) {
        //             let infoReq = new InfoRequest(completion);
        //             let infoResponse = await infoReq.send(hsdevClient);

        //             var identifier = CompletionUtils.truncResp(word, completion);
        //             return {
        //                 label: identifier,
        //                 kind: CompletionUtils.toCompletionType(infoResponse.kind),
        //                 detail: infoResponse.detail,
        //                 documentation: infoResponse.documentation,
        //                 data: completion
        //             };
        //         }
        //         else {
        //             return {
        //                 label: completion,
        //                 kind: vsrv.CompletionItemKind.Function,
        //                 data: null
        //             };
        //         }
        //     })
        // );
    }

    public static async getResolveInfos(hsdevClient: HsDevClient, item: vsrv.CompletionItem): Promise<vsrv.CompletionItem> {
        return item;
        //When the global getCompletionItems didn't get details (because it reachs the maxAutoCompletionDetails limit)
        //it returns data = null and label = completion text
        //in this particular case only, we still try to get the details for the completion item
        // if (!item.data && item.label) {
        //     const infoRequest = new InfoRequest(item.label);
        //     let infoResponse = await infoRequest.send(hsdevClient);
        //     return {
        //         label: item.label,
        //         kind: CompletionUtils.toCompletionType(infoResponse.kind),
        //         detail: infoResponse.detail,
        //         documentation: infoResponse.documentation
        //     };
        // }
        // else {
        //     return null;
        // }
    }
}