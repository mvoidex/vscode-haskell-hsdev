/**
 * Warning, this function uses exec, so the regexp object is mutated
 * @param text
 * @param regexp
 */
export function allMatchs(text: string, regexp: RegExp): RegExpExecArray[] {
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray;

    while ((match = regexp.exec(text)) !== null) {
        matches.push(match);
    }
    return matches;
}

/**
 * Warning, this function uses exec, so the regexp object is mutated
 * @param text
 * @param regexp
 */
export function firstGroupOfFirstMatch(text: string, regexp: RegExp): string {
    let match: RegExpExecArray = regexp.exec(text);
    if (match !== null && match.length > 1) {
        return match[1];
    }
    return null;
}