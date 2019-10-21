import { HsDevRange } from './hsdevRange';

export class HsDevLocation {
    constructor(public readonly file: string, public readonly range: HsDevRange) { }
}
