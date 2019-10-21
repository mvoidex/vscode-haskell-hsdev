import * as cp from 'child_process';
import * as os from 'os';
import { workspace } from 'vscode';
import { HsDevTargets } from './targets';

/**
 * Get targets defined in the project, if error then []
 */
export function getTargets(stackPath: string): Promise<HsDevTargets> {
    return new Promise((resolve, reject) => {
        const cwd = process.cwd();
        let fs = workspace.workspaceFolders;
        if (fs) {
            fs.forEach(folder => {
                process.chdir(folder.uri.fsPath);
                cp.exec(`${stackPath} ide targets`, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    }

                    let targets : string[] = [];
                    if (stderr) {
                        targets = parseTargets(stderr);
                    }
                    resolve(new HsDevTargets(targets));
                });
            });
            process.chdir(cwd);
        }
    });
}

export function getProjects(stackPath: string, path: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const cwd = process.cwd();
        process.chdir(path);
        cp.exec(`${stackPath} ide packages --stdout --cabal-files`, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }
            resolve(stdout ? stdout.split(os.EOL) : []);
        });
        process.chdir(cwd);
    });
}

function allMatchs(text: string, regexp: RegExp): RegExpExecArray[] {
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;

    while ((match = regexp.exec(text)) !== null) {
        matches.push(match);
    }
    return matches;
}

function parseTargets(raw: string): string[] {
    const regTargets = /^.+[:].+$/mg;
    return allMatchs(raw, regTargets).map(regArr => regArr[0]);
}