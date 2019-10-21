import { Position, TextEditor, TextLine } from 'vscode';

/**
 * Utilities to handle a TextEditor
 */
export class EditorUtils {
    private static identifierSymbols = /[0-9a-zA-Z_']/g;

    /**
     * True is 'c' is a symbol char used in the haskell language
     */
    public static isIdentifierSymbol(c: string): boolean {
        return c.search(EditorUtils.identifierSymbols) !== -1;
    }

    /**
     * Returns the leftmost symbol index (0-based) of the given line offset
     */
    public static findStartingColumn(line: string, currentCol: number): number {
        let col = currentCol;
        while (col >= 0 && EditorUtils.isIdentifierSymbol(line.charAt(col))) {
            col--;
        }
        return col + 1;
    }

    /**
     * Returns the current editor position line
     */
    public static getCurrentLine(editor: TextEditor): TextLine {
        return editor.document.lineAt(editor.selection.start.line);
    }

    /**
     * Returns the leftmost symbol index (0-based) of the gcurrent position in the editor
     */
    public static getFirstSymbolFromCurrentPosition(editor: TextEditor): number {
        let currentLine = EditorUtils.getCurrentLine(editor);
        let currentPos = editor.selection.start;
        let startingColumn = EditorUtils.findStartingColumn(currentLine.text, currentPos.character);
        return startingColumn;
    }
}