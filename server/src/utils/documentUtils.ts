'use strict';

import { TextDocument, Position, Range } from 'vscode-languageserver';
import * as vsrv from 'vscode-languageserver';
import { HsDevRange } from '../hsdev/hsdevRange';
import * as fs from 'fs';
import { UriUtils } from "./uriUtils";
import * as syntax from '../hsdev/syntaxTypes';
import { CompletionUtils } from 'src/completionUtils';

/**
 * Word at a known position (Range) in the document
 */
export class WordSpot {
    word: string;
    range: Range;

    constructor(word: string, range: Range) {
        this.word = word;
        this.range = range;
    }

    public get isEmpty(): boolean { return this.range.start.character === this.range.end.character && this.range.start.line === this.range.end.line; }
}

/**
 * Behaviour from cursor position when there is no matching char
 */
export enum NoMatchAtCursorBehaviour {
    //if char at cursor is not a match, stop
    Stop,
    //if char at cursor is not a match, looks for one char left
    LookLeft,
    //if char at cursor is not a match, looks for one char right
    LookRight,
    //if char at cursor is not a match, looks for one char both sides
    LookBoth
}

export interface QualifiedIdentifier {
    qualifier: string;
    name: string;
}

/**
 * Tools for document manipulations
 */
export class DocumentUtils {
    private static identifierSymbols = /[0-9a-zA-Z_'.]/g;

    private static isIdentifierSymbol(c: string): boolean {
        return c.search(DocumentUtils.identifierSymbols) !== -1;
    }

    private static getStartingOffset(text: string, cursorOffset: number, isValidSymbol: (string) => boolean, sticky: NoMatchAtCursorBehaviour): number {
        if (isValidSymbol(text.charAt(cursorOffset)) || sticky === NoMatchAtCursorBehaviour.LookLeft || sticky === NoMatchAtCursorBehaviour.LookBoth) {
            let i = cursorOffset;
            for (i; i > 0 && isValidSymbol(text.charAt(i - 1)); i--) {
            }
            return i;
        }
        else {
            return cursorOffset;
        }
    }

    private static getEndingOffset(text: string, cursorOffset: number, isValidSymbol: (string) => boolean, sticky: NoMatchAtCursorBehaviour): number {
        if (isValidSymbol(text.charAt(cursorOffset)) || sticky === NoMatchAtCursorBehaviour.LookRight || sticky === NoMatchAtCursorBehaviour.LookBoth) {
            let i = Math.max(0, cursorOffset);
            for (i; i < text.length && isValidSymbol(text.charAt(i)); i++) {
            }
            return i;
        }
        else {
            return cursorOffset;
        }
    }

    public static toPosition(pos: syntax.Position): vsrv.Position {
        return vsrv.Position.create(pos.line - 1, pos.column - 1);
    }

    public static toRange(rgn: syntax.Region): vsrv.Range {
        return vsrv.Range.create(
            DocumentUtils.toPosition(rgn.start),
            DocumentUtils.toPosition(rgn.end)
        );
    }

    public static toLocation(loc: syntax.FileLocation, rgn: syntax.Region): vsrv.Location {
        return vsrv.Location.create(UriUtils.toUri(loc.filename), DocumentUtils.toRange(rgn));
    }

    /**
     * return text at position, where text is composed of identifier characters
     */
    public static getIdentifierAtPosition(document: TextDocument, position: Position, sticky: NoMatchAtCursorBehaviour): WordSpot {
        let text = document.getText();
        let cursorOffset = document.offsetAt(position);
        let startOffset = DocumentUtils.getStartingOffset(text, cursorOffset, DocumentUtils.isIdentifierSymbol, sticky);
        let endOffset = DocumentUtils.getEndingOffset(text, cursorOffset, DocumentUtils.isIdentifierSymbol, sticky);
        let word = text.slice(startOffset, endOffset);

        return new WordSpot(word, Range.create(document.positionAt(startOffset), document.positionAt(endOffset)));
    }

    public static getQualifiedSymbol(word: string): QualifiedIdentifier {
        let parts = word.split('.');
        let name = parts.pop();
        return {
            qualifier: parts.join('.'),
            name: name
        };
    }

    public static getTextAtRange(document: TextDocument, range: Range) {
        let text = document.getText();
        let startOffset = document.offsetAt(range.start);
        let endOffset = document.offsetAt(range.end);
        return text.slice(startOffset, endOffset);
    }

    /**
     * Returns True if the given position is included in the range
     */
    public static isPositionInRange(position: Position, range: Range): boolean {
        if (position === null || range === null) {
            return false;
        }
        if (position.line < range.start.line || position.line > range.end.line ||
            position.character < range.start.character || position.character > range.end.character) {
            return false;
        }
        return true;
    }

    //vscode range are 0 based
    public static toVSCodeRange(hsdevRange: HsDevRange): Range {
        return Range.create(hsdevRange.startLine - 1, hsdevRange.startCol - 1, hsdevRange.endLine - 1,
            hsdevRange.endCol - 1);
    }

    //hsdev range are 1 based
    public static toHsDevRange(range: Range): HsDevRange {
        return new HsDevRange(range.start.line + 1, range.start.character + 1, range.end.line + 1,
            range.end.character + 1);
    }

    /**
    * Returns the current text document position line
    */
    public static getPositionLine(document: TextDocument, position: Position): string {
        const text = document.getText();
        const startingPos = Position.create(position.line, 0);
        const endingPos = Position.create(position.line, Number.MAX_VALUE);
        const startingOffset = document.offsetAt(startingPos);
        const endingOffset = document.offsetAt(endingPos);
        return text.slice(startingOffset, endingOffset);
    }

    /**
     * Check if the 'text' is present on the left side of the position, in the same line
     */
    public static leftLineContains(document: TextDocument, position: Position, text: string): boolean {
        const line = DocumentUtils.getPositionLine(document, position);
        const leftLine = line.substring(0, position.character);
        return leftLine.indexOf(text) > -1;
    }

    public static loadUriFromDisk(uri: string): Promise<TextDocument> {
        return new Promise<TextDocument>((resolve, reject) => {
            let text = '';
            let reader = fs.createReadStream(UriUtils.toFilePath(uri));
            reader.on('data', (chunk) => {
                text += chunk;
            });
            reader.on('end', () => {
                resolve(TextDocument.create(uri, "haskell", 1, text));
            });
            reader.on('error', reason => {
                reject(reason);
            });
        });
    }
}