import CheckBox from './checkBox';
import * as vscode from 'vscode';

/**
 * Checkboxlist prompt
 */
export default class CheckBoxList {
    constructor(private readonly checkBoxes: CheckBox[]) { }

    /**
     * Show a checkboxlist to the user
     */
    public show(): Thenable<CheckBox[] | null> {
        return this.innerShow(this.checkBoxes);
    }

    private async innerShow(checkBoxes: CheckBox[]): Promise<CheckBox[] | null> {

        let qpOptions = checkBoxes.map(c => c.name());
        qpOptions.push("Validate");

        const selectedNames = await vscode.window.showQuickPick(qpOptions);
        if (!selectedNames) {
            return null;
        }
        //If user validate the choices
        if (selectedNames === "Validate") {
            //if the user don't select anything, show the checkboxes again
            if (checkBoxes.find(c => c.isSelected) === undefined) {
                return this.innerShow(checkBoxes);
            }
            return checkBoxes;
        }
        //else, the user select (or unselect) an option
        else {
            const selectedChoice = checkBoxes.find(c => c.value === CheckBox.nameToValue(selectedNames));
            //when a unique option is selected, it has to be the only one
            if (selectedChoice && selectedChoice.isUnique) {
                checkBoxes.forEach(cb => {
                    cb.unCheck();
                });
            }
            else {
                //when selecting a non-unique option, unselect all unique
                checkBoxes.filter(cb => cb.isUnique).forEach(cb => {
                    cb.unCheck();
                });
            }
            if (selectedChoice) {
                selectedChoice.switch();
            }
            return this.innerShow(checkBoxes);
        }
    }
}