import * as vsrv from 'vscode-languageserver';
import { HsDevService } from "../hsdevService";

/**
 * There are a finite number of HsDevCommand. (remove duplicate command, top level signature command, etc.)
 */

/**
 * Description of a command.
 */
export interface HsDevCommand {
    title: string;
    command: string;
    instanciate(args?: any[]): HsDevCommandInstance;
}

export interface HsDevCommandInstance extends vsrv.Command {
    execute(workSpace: vsrv.RemoteWorkspace, documents: vsrv.TextDocuments, hsdevService: HsDevService): void;
}