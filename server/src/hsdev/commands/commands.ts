'use strict';

import { Result, success, fail, defined } from '../../utils/result';
import { Parser, SymbolId, Symbol, SymbolUsage, ModuleId, Module, parseList, PackageDb, PredefinedPackageDb, CustomPackageDb, Package, parsePackageDb, FileLocation, Region } from '../syntaxTypes';
import { LogLevel } from '../../debug/debugUtils';


export interface Serializable {
    serialize(): any;
}


export interface HsDevCommand<T> extends Serializable {
    command: string;
    parseResponse: Parser<T>;
}


const ignore: Parser<void> = (result: any) => { return success<void>(undefined); };


export enum TypeInfoKind {
    Instanciated,
    Generic
}


export enum SearchType {
    Exact,
    Prefix,
    Infix,
    Suffix
}


export interface SearchQuery extends Serializable {
    text: string;
    searchType: SearchType;
}


export enum TargetSourceType {
    Installed,
    Sourced,
    Standalone
}

export enum TargetType {
    Project,
    File,
    Module,
    Package
}

export type SearchFilter = TargetSourceType | {target: TargetType, name: string};


export function serializeSearchFilter(f: SearchFilter): any {
    if (typeof(f) === 'number') {
        return TargetSourceType[f].toLowerCase();
    }
    return {[TargetType[f.target].toLowerCase()]: f.name};
}

export function parseSearchFilter(f: any): Result<SearchFilter> {
    if (typeof(f) === 'string') {
        let s = f[0].toUpperCase() + f.substr(1);
        let sourceType : TargetSourceType | undefined = TargetSourceType[s];
        return defined(sourceType, `Error parsing target source type: ${f}`);
    } else {
        let keys = Object.keys(f);
        if (keys.length !== 1) {
            return fail(`Search filter object should contain only one key: ${f}`);
        }
        let key = keys[0];
        let s = key[0].toUpperCase() + key.substr(1);
        let targetType : TargetType | undefined = TargetType[s];
        return defined(targetType, `Error parsing target type: ${f}`).bind((t) => {
            return success({target: t, name: f[key]});
        });
    }
}

export class Ping implements HsDevCommand<void> {
    public command = "ping";
    public serialize(): any { return {}; }
    public parseResponse = ignore;
}

export class SetLogLevel implements HsDevCommand<void> {
    public command = "set-log";
    public constructor(public readonly level: LogLevel) {}
    public serialize(): any { return {level: LogLevel[this.level].toLowerCase()}; }
    public parseResponse = ignore;
}

export interface ScanTarget extends Serializable {
    targetType: string;
}

export enum BuildTool {
    Cabal,
    Stack
}

export class SearchQuery implements SearchQuery {
    public constructor(public text: string = '', public searchType: SearchType = SearchType.Prefix) {}
    public serialize(): any {
        return {input: this.text, type: SearchType[this.searchType].toLowerCase()};
    }
}

export class ProjectTarget implements ScanTarget {
    public targetType = "project";
    public constructor(
        public readonly project: string,
        public readonly buildTool: BuildTool,
        public readonly scanDeps: boolean = true
    ) {}
    public serialize(): any {
        return {project: this.project, "build-tool": BuildTool[this.buildTool].toLowerCase(), "scan-deps": this.scanDeps};
    }
}

export class FileTarget implements ScanTarget {
    public targetType = "file";
    public constructor(
        public readonly file: string,
        public readonly buildTool: BuildTool,
        public readonly scanProject: boolean = true,
        public readonly scanDeps: boolean = true
    ) {}
    public serialize(): any {
        return {file: this.file, "build-tool": BuildTool[this.buildTool].toLowerCase(), "scan-project": this.scanProject, "scan-deps": this.scanDeps};
    }
}

export class PackageDbsTarget implements ScanTarget {
    public targetType = "package-dbs";
    public constructor(
        public packageDbsStack: PackageDb[]
    ) {}
    public serialize(): any {
        let dbs = this.packageDbsStack.map(p => {
            if (typeof(p) === 'number') {
                switch (p) {
                    case PredefinedPackageDb.GlobalDb: return 'global-db';
                    case PredefinedPackageDb.UserDb: return 'user-db';
                }
            } else {
                return `package-db:${(p as CustomPackageDb).path}`;
            }
        }).join('/');
        return {"package-db-stack": dbs};
    }
}

export class Scan implements HsDevCommand<void> {
    public command: string;
    public constructor(
        public readonly target: ScanTarget
    ) {
        this.command = `scan ${target.targetType}`;
    }
    public serialize(): any {
        return this.target.serialize();
    }
    public parseResponse = ignore;
}

export class SetFileContents implements HsDevCommand<void> {
    public command = "set-file-contents";
    public constructor(
        public readonly file: string,
        public contents: string | null
    ) {}
    public serialize(): any {
        return {file: this.file, contents: this.contents};
    }
    public parseResponse = ignore;
}

export class RefineDocs implements HsDevCommand<void> {
    public command = "docs";
    public constructor(
        public projects: string[],
        public files: string[]
    ) {}
    public serialize(): any {
        return {projects: this.projects, files: this.files};
    }
    public parseResponse = ignore;
}

export class InferTypes implements HsDevCommand<void> {
    public command = "infer";
    public constructor(
        public projects: string[],
        public files: string[]
    ) {}
    public serialize(): any {
        return {projects: this.projects, files: this.files};
    }
    public parseResponse = ignore;
}

export class RemoveAll implements HsDevCommand<void> {
    public command = "remove-all";
    public serialize(): any { return {}; }
    public parseResponse = ignore;
}

export class InfoPackages implements HsDevCommand<Package[]> {
    public command = "packages";
    public serialize(): any { return {}; }
    public parseResponse = parseList(Package.parse);
}

export class InfoSandboxes implements HsDevCommand<PackageDb[]> {
    public command = "sandboxes";
    public serialize(): any { return {}; }
    public parseResponse = parseList(parsePackageDb);
}

export class InfoSymbol implements HsDevCommand<SymbolId[] | Symbol[]> {
    public command = "symbol";
    public constructor(
        public readonly query: SearchQuery,
        public filters: SearchFilter[] = [],
        public readonly header: boolean = false,
        public readonly locals: boolean = false
    ) {
        this.parseResponse = parseList(this.header ? SymbolId.parse : Symbol.parse);
    }
    public serialize(): any {
        return {
            query: this.query.serialize(),
            filters: this.filters.map(serializeSearchFilter),
            header: this.header,
            localc: this.locals,
        };
    }
    public parseResponse: Parser<SymbolId[] | Symbol[]>;
}

export class InfoModule implements HsDevCommand<ModuleId[] | Module[]> {
    public command = "module";
    public constructor(
        public readonly query: SearchQuery,
        public filters: SearchFilter[] = [],
        public readonly header: boolean = false,
        public readonly inspection: boolean = false
    ) {
        this.parseResponse = parseList(this.header ? ModuleId.parse : Module.parse);
    }
    public serialize(): any {
        return {
            query: this.query.serialize(),
            filters: this.filters.map(serializeSearchFilter),
            header: this.header,
            inspection: this.inspection
        };
    }
    public parseResponse: Parser<ModuleId[] | Module[]>;
}

export class Lookup implements HsDevCommand<Symbol[]> {
    public command = "lookup";
    public constructor(public readonly name: string, public readonly file: string) {}
    public serialize(): any {
        return {name: this.name, file: this.file};
    }
    public parseResponse = parseList(Symbol.parse);
}

export class Whois implements HsDevCommand<Symbol[]> {
    public command = "whois";
    public constructor(public readonly name: string, public readonly file: string) {}
    public serialize(): any {
        return {name: this.name, file: this.file};
    }
    public parseResponse = parseList(Symbol.parse);
}

export class Whoat implements HsDevCommand<Symbol[]> {
    public command = "whoat";
    public constructor(public readonly line: number, public readonly column: number, public readonly file: string) {}
    public serialize(): any {
        return {line: this.line, column: this.column, file: this.file};
    }
    public parseResponse = parseList(Symbol.parse);
}

export class ResolveScopeModules implements HsDevCommand<ModuleId[]> {
    public command = "scope modules";
    public constructor(public readonly query: SearchQuery, public readonly file: string) {}
    public serialize(): any {
        return {query: this.query.serialize(), file: this.file};
    }
    public parseResponse = parseList(ModuleId.parse);
}

export class ResolveScope implements HsDevCommand<SymbolId[]> {
    public command = "scope";
    public constructor(public readonly query: SearchQuery, public readonly file: string) {}
    public serialize(): any {
        return {query: this.query.serialize(), file: this.file};
    }
    public parseResponse = parseList(SymbolId.parse);
}

export class FindUsages implements HsDevCommand<SymbolUsage[]> {
    public command = "usages";
    public constructor(
        public readonly line: number,
        public readonly column: number,
        public readonly file: string
    ) {}
    public serialize(): any {
        return {line: this.line, column: this.column, file: this.file};
    }
    public parseResponse = parseList(SymbolUsage.parse);
}

export class Complete implements HsDevCommand<Symbol[]> {
    public command = "complete";
    public constructor(
        public readonly prefix: string,
        public readonly file: string,
        public readonly wide: boolean = false
    ) {}
    public serialize(): any {
        return {prefix: this.prefix, wide: this.wide, file: this.file};
    }
    public parseResponse = parseList(Symbol.parse);
}

export enum Severity {
    Hint,
    Warning,
    Error
}

export interface Note<T extends Serializable> extends Serializable {
    note: T;
    source: FileLocation;
    rgn: Region;
    sev?: Severity;
}

export interface OutputMessage extends Serializable {
    message: string;
    suggestion?: string;
}

export class Note<T extends Serializable> implements Note<T> {
    public constructor(
        public note: T,
        public source: FileLocation,
        public rgn: Region,
        public sev?: Severity
    ) {}
    public serialize(): any {
        return {
            note: this.note.serialize(),
            source: {file: this.source.filename},
            level: Severity[this.sev].toLowerCase(),
            region: { from: this.rgn.start, to: this.rgn.end }
        };
    }
}

export class CheckLint implements HsDevCommand<any[]> {
    public command = "check-lint";
    public constructor(
        public files: string[],
        public ghcOpts: string[] = [],
        public lintOpts: string[] = [],
        public clear: boolean = false
    ) {}
    public serialize(): any {
        return {
            files: this.files.map(f => { return {file: f}; }),
            "ghc-opts": this.ghcOpts,
            "lint-opts": this.lintOpts,
            clear: this.clear
        };
    }
    public parseResponse = (value: any) => success(value as any[]);
}

export class Exit implements HsDevCommand<void> {
    public command = "exit";
    public serialize(): any { return {}; }
    public parseResponse = ignore;
}
