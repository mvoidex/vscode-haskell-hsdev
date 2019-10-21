import * as tmp from 'tmp';
import * as fs from 'fs';
import * as vsrv from 'vscode-languageserver';
import { HsDevService } from "../hsdevService";
import { DocumentUtils, NoMatchAtCursorBehaviour } from "../utils/documentUtils";
import { UriUtils } from "../utils/uriUtils";
import { HsDevRange } from "../hsdev/hsdevRange";
import { HsDevDiagnostic } from "../hsdev/commands/hsdevDiagnostic";
import { DebugUtils } from "../debug/debugUtils";

export default function (documents: vsrv.TextDocuments, hsdevService: HsDevService) {
    return async (params: vsrv.RenameParams): Promise<vsrv.WorkspaceEdit> => {

        //list modules to check for rename
        let loadedModulesPaths = await getAndLoadMissingModules(params.textDocument.uri);

        //sourceModule : haskell source where the user asked for a rename
        if ((await safeRename(documents, params)) === false) {
            return null;
        }

        //modules to fix are different from loaded modules
        let modulesPathToFix = [...loadedModulesPaths];

        //contains all the edits this rename involves
        let filesEdits = new Map<string, vsrv.TextEdit[]>();

        //1 - get definition site information

        let definitionDocument: vsrv.TextDocument;
        let definitionPosition: vsrv.Position;
        {
            let sourceDocument = documents.get(params.textDocument.uri);
            let location = await hsdevService.getDefinitionLocation(sourceDocument, params.position);
            //if we are at the defintion site
            if (location.uri === params.textDocument.uri && DocumentUtils.isPositionInRange(params.position, location.range)) {
                definitionDocument = sourceDocument;
                definitionPosition = params.position;
            }
            else {
                //load from disk because location.uri is not necessarily opened in the editor (just opened documents are available in the TextDocuments object)
                definitionDocument = await DocumentUtils.loadUriFromDisk(location.uri);
                definitionPosition = location.range.start;
            }
        }
        let { word: oldName, range: definitionRange } = DocumentUtils.getIdentifierAtPosition(definitionDocument, definitionPosition, NoMatchAtCursorBehaviour.LookBoth); //getTextAtRange(locationDocument, location.range);

        //2 - rename definition site oldName to newName

        let newText = renameIdentifier(definitionDocument, definitionDocument.getText(), definitionRange, params.newName);
        //create a text edit to rename the definition site
        addEdits(filesEdits, definitionDocument.uri, [vsrv.TextEdit.replace(definitionRange, params.newName)]);

        //create a tmp file for the definition file with this newname and fix all errors
        let tmpDefinitionFilePath = await createTmpFile(newText);
        let tmpDefinitionURI = UriUtils.toUri(tmpDefinitionFilePath);
        let definitionSiteEdits = await fixModuleFile(tmpDefinitionURI, null, oldName, params.newName); //the definition site for the definition is null
        addEdits(filesEdits, definitionDocument.uri, definitionSiteEdits);

        // remove the definition site module from the list of modules to fix
        modulesPathToFix.splice(modulesPathToFix.indexOf(UriUtils.toFilePath(definitionDocument.uri)), 1);

        //3 - fix all previously opened modules

        await Promise.all(modulesPathToFix.map(async modulePath => {
            let moduleURI = UriUtils.toUri(modulePath);
            let moduleDocument = await DocumentUtils.loadUriFromDisk(moduleURI);
            let tmpFilePath = await createTmpFile(moduleDocument.getText());
            let modulesEdits = await fixModuleFile(UriUtils.toUri(tmpFilePath), tmpDefinitionURI, oldName, params.newName);
            addEdits(filesEdits, moduleURI, modulesEdits);
        }));

        //4 - unload all modules and reload previously loaded modules
        // await hsdevService.executeHsDevRequest(new LoadRequest([], false));
        // await hsdevService.executeHsDevRequest(new LoadRequest(loadedModulesPaths.map(UriUtils.toUri), false));

        let workSpaceEdits: vsrv.WorkspaceEdit = { changes: {} };
        filesEdits.forEach((v, k) => {
            workSpaceEdits.changes[k] = v;
            // console.log(k);
            // v.forEach(c => console.dir(c));
        });

        return workSpaceEdits;
    };

    async function getAndLoadMissingModules(sourceDocumentUri: string): Promise<string[]> {
        return [];
        // let loadedModulesPaths = (await hsdevService.executeHsDevRequest(new ShowModulesRequest())).modules;

        // //sometimes, the renameDocument where the user asks for a rename is not loaded
        // //we have to load and to add it
        // let sourceDocumentPath = UriUtils.toFilePath(sourceDocumentUri);
        // if (!loadedModulesPaths.some(m => m === sourceDocumentPath)) {
        //     await hsdevService.executeHsDevRequest(new LoadRequest([sourceDocumentUri], false));
        //     loadedModulesPaths.push(sourceDocumentPath);
        // }
        // return loadedModulesPaths;
    }

    /**
     * Returns true if it's safe to rename, false otherwise
     * Abord rename if
     *  - we try to rename a Type
     *  - the new name allready exists
     */
    async function safeRename(documents: vsrv.TextDocuments, params: vsrv.RenameParams): Promise<boolean> {
        return false;
        // let isTypeDefinition = /^[A-Z].*/;
        // let sourceDocument = documents.get(params.textDocument.uri);
        // let nameToChange = DocumentUtils.getIdentifierAtPosition(sourceDocument, params.position, NoMatchAtCursorBehaviour.LookBoth).word;
        // let typeResponse = await hsdevService.executeHsDevRequest(new TypeRequest(params.newName));
        // return typeResponse.identifierExists === false && !isTypeDefinition.test(nameToChange);
    }

    function addEdits(filesEdits: Map<string, vsrv.TextEdit[]>, uri: string, edits: vsrv.TextEdit[]) {
        let es = filesEdits.get(uri);
        if (!es) {
            es = [];
            filesEdits.set(uri, es);
        }
        es.push(...edits);
    }

    async function fixModuleFile(uri: string, uriDefinitionModule: string, oldName: string, newName: string): Promise<vsrv.TextEdit[]> {
        return [];
        // let filePath = UriUtils.toFilePath(uri);
        // let document = await DocumentUtils.loadUriFromDisk(uri);
        // let newText = document.getText();
        // let uris = uriDefinitionModule ? [uri, uriDefinitionModule] : [uri];
        // // console.log("uris :" + uris);
        // let loadResponse = await hsdevService.executeHsDevRequest(new LoadRequest(uris, true));
        // let oldNameErrors = loadResponse.errors.filter(e => e.filePath === filePath && e.message.indexOf(oldName) > -1);

        // let edits = new Array<vsrv.TextEdit>();

        // // console.log("errors in : " + uri);
        // // console.dir(loadResponse.errors);

        // if (oldNameErrors.length > 0) {
        //     edits = oldNameErrors
        //         .reverse() //starting from the end, its a trick to rename identifier from the end in order avoid shifts when renaming with a new identifier with different length
        //         .map(e => {
        //             let range = errorToRange(document, e);
        //             newText = renameIdentifier(document, newText, range, newName);
        //             return vsrv.TextEdit.replace(range, newName);
        //         });

        //     await saveNewTextForDocument(document, newText);

        //     edits.push(...await fixModuleFile(uri, uriDefinitionModule, oldName, newName));
        // }
        // else {
        //     // console.log("------------");
        //     //console.log(newText);
        // }
        // return edits;
    }

    async function saveNewTextForDocument(document: vsrv.TextDocument, newText: string): Promise<{}> {
        let path = UriUtils.toFilePath(document.uri);

        return new Promise((resolve, reject) => {
            let stream = fs.createWriteStream(path);
            stream.on('finish', () => {
                resolve();
            });
            stream.on('error', reason => reject(reason));
            stream.write(newText);
            stream.end();
            stream.close();
        });
    }

    function errorToRange(document: vsrv.TextDocument, error: HsDevDiagnostic): vsrv.Range {
        //position in error message are 1 based. Position are 0 based, but there is a issue somewhere because it works without (-1) :-(
        let identifier = DocumentUtils.getIdentifierAtPosition(document, vsrv.Position.create(error.line, error.col), NoMatchAtCursorBehaviour.LookBoth);
        return identifier.range;
    }

    function renameIdentifier(document: vsrv.TextDocument, text: string, range: vsrv.Range, newName: string): string {
        let startingOffset = document.offsetAt(range.start);
        let endingOffset = document.offsetAt(range.end);
        //Array(wordSpot.word.length + 1).join("-")

        return text.substr(0, startingOffset) + newName + text.substr(endingOffset, text.length - endingOffset);
    }

    function createTmpFile(content: string): Promise<string> {
        return new Promise((resolve, reject) => {
            tmp.file({ prefix: 'hsdev-', postfix: '.hs' }, (err, path, fd, cleanUpFct) => {
                DebugUtils.instance.log("Creating tmp file for the renaming process: " + path);
                let tmpStream = fs.createWriteStream(path);
                tmpStream.on('finish', () => {
                    resolve(path);
                });
                tmpStream.on('error', reason => reject(reason));
                tmpStream.write(content);
                tmpStream.end();
            });
        });
    }
}