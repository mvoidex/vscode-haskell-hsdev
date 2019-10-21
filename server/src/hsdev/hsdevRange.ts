/**
 * hsdev range are 1 based
 */
export class HsDevRange {
    constructor(public readonly startLine: number, public readonly startCol: number, public readonly endLine: number, public readonly endCol: number) { }
}
