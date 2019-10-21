export default class CheckBox {

    private checkboxOn = '☒';
    private checkboxOff = '☐';

    public get isSelected(): boolean {
        return this._isSelected;
    }

    public get value(): string {
        return this._value;
    }

    public name(): string {
        return (this.isSelected ? this.checkboxOn : this.checkboxOff) + ' ' + this.value;
    }

    constructor(private readonly _value: string, private _isSelected: boolean, public readonly isUnique: boolean) {
    }

    public switch() {
        this._isSelected = !this._isSelected;
    }

    public unCheck() {
        this._isSelected = false;
    }

    public static nameToValue(name: string) {
        //remove the 2 begining char (box and space)
        return name.slice(2);
    }
}