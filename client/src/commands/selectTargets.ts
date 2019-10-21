import * as vscode from 'vscode';
import * as vscli from 'vscode-languageclient';
import { allTargets } from '../utils/targets';
import CheckBoxList from '../utils/checkBoxList';
import CheckBox from '../utils/checkBox';
import { HsDevTargets } from '../utils/targets';
import { HsDevClient, HsDevClientInitOptions } from '../utils/hsdevClient';

/**
 * Command which opens a quickpick selection menu to select the active Cabal target
 * in the hsdev service
 */
export class SelectTarget {
    public static readonly onTargetsSelected = new vscode.EventEmitter<HsDevTargets>();
    public static readonly id: string = 'hsdev.selectTarget';

    public readonly id: string = SelectTarget.id;

    constructor(private readonly hsdevClient: HsDevClient) {}

    public handler = () => {
        if (this.hsdevClient.client === null) {
            return;
        } else {
            let client = this.hsdevClient.client;
            this.hsdevClient.getTargets().then((hsdevTargets) => {
                const boxList = new CheckBoxList(hsdevTargets.targetList.map(t => new CheckBox(t.name, t.isSelected, t.isUnique)));

                boxList.show().then(
                    (checkBoxes) => {
                        if (checkBoxes === null) {
                            return;
                        }

                        checkBoxes.forEach(cb => {
                            hsdevTargets.setSelectedTarget(cb.value, cb.isSelected);
                        });

                        let newTargets = hsdevTargets.toHsDevTargets();

                        //sendNotification need an array of parameters and here, the target array is ONE parameter
                        return client
                            .sendRequest('changeTargets', [newTargets])
                            .then(
                                resp => {
                                    client.info("Change target done.", resp);
                                    vscode.window.showInformationMessage("Change target done. " + resp);
                                    SelectTarget.onTargetsSelected.fire(hsdevTargets);
                                },
                                reason => {
                                    client.error(`Change targets failed. Stopping hsdev for this target. Switch to another target or 'Default targets'.
            Hint : try running a build command to get missing dependencies (> stack build ${newTargets.join(' ')})
            Error details:
            `, reason);
                                    vscode.window.showErrorMessage("Change targets failed. Stopping hsdev for this target. Switch to another target or 'Default targets'.");
                                }
                            );
                    },
                    (reason) => {
                        console.log("cata : ");
                        console.dir(reason);
                    }
                );
            });
        }
    }
}