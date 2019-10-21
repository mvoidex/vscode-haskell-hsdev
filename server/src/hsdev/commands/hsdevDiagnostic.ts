'use strict';

export enum HsDevDiagnosticKind {
    warning,
    error
}

/**
 * An hsdev diagnostic : warning or error
 */
export class HsDevDiagnostic {
    public constructor(public filePath: string,
        public readonly line: number,
        public readonly col: number,
        public readonly message: string,
        public readonly kind: HsDevDiagnosticKind) {
        this.line = line - 1;
        this.col = col - 1;
    }
}