'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as vscli from 'vscode-languageclient';
import { InsertTypeAbove } from './commands/insertTypeAbove';
import { SelectTarget } from './commands/selectTargets';
import { EditorUtils } from './utils/editorUtils';
import { getTargets } from './utils/stack';
import { noTargets, allTargets } from './utils/targets';
import { HsDevClient, HsDevClientInitOptions, HsDevSettings } from './utils/hsdevClient';


export function activate(context: vscode.ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(path.join('server', 'src', 'server.js'));
    let hsdevClient = new HsDevClient(serverModule, true);

    let initOptions: HsDevClientInitOptions = {
        settings: getSettings(),
        targets: [] //no target for starting the extension
    };

    hsdevClient.start(initOptions);

    registerCommands(hsdevClient, context);
    createTargetSelectionButton(context);

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    context.subscriptions.push(hsdevClient);
}


/**
 * Returns value if value is not null or undefined, otherwise returns defaultValue
*/
function df<T>(value: T, defaultValue: T): T {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    else {
        return value;
    }
}

function getSettings(): HsDevSettings {
    ///get initialization settings from current workspace getConfiguration
    let hsdevSettings: HsDevSettings = {
        stackPath: df(<string>vscode.workspace.getConfiguration('hsdev').get('stackPath'), 'stack'),
        hsdevPath: df(<string>vscode.workspace.getConfiguration('hsdev').get('hsdevPath'), 'hsdev')
    };
    return hsdevSettings;
}

/**
 * Register all hsdev available commands
 */
function registerCommands(hsdevClient: HsDevClient, context: vscode.ExtensionContext) {
    const cmds = [
        new InsertTypeAbove(hsdevClient),
        new SelectTarget(hsdevClient),
    ];

    cmds.forEach((cmd) => {
        context.subscriptions.push(vscode.commands.registerCommand(cmd.id, cmd.handler));
    });
}

/**
 * Create the Cabal target selection button in the status bar
 */
function createTargetSelectionButton(context: vscode.ExtensionContext) {
    const barItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
    barItem.text = "Targets: default";
    barItem.command = SelectTarget.id;
    barItem.show();
    context.subscriptions.push(
        SelectTarget.onTargetsSelected.event((hsdevTargets) => {
            barItem.text = hsdevTargets.toText();
        })
    );
}