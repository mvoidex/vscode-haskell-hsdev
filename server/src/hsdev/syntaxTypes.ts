'use strict';


import { Result, success, fail, defined, traverse, traverseAny, Unwrap, selectOne } from '../utils/result';
import { TextEditorLineNumbersStyle } from 'vscode';


export type Parser<T> = (value: any) => Result<T>;


export interface Eq<T> {
    eq: (rhs: T) => boolean;
}

export enum Ordering {
    Less,
    Equals,
    Greater
}

export function compare(lhs: any, rhs: any): Ordering {
    if (lhs < rhs) { return Ordering.Less; }
    if (lhs === rhs) { return Ordering.Equals; }
    return Ordering.Greater;
}

export function lexicCompare(lhs: any[], rhs: any[]): Ordering {
    let cmps: Ordering[];
    for (var i = 0; i < Math.max(lhs.length, rhs.length); ++i) {
        let l = lhs[i];
        let r = rhs[i];
        if (l === undefined) {
            cmps.push(Ordering.Less);
        } else if (r === undefined) {
            cmps.push(Ordering.Greater);
        } else if ('cmp' in l && 'cmp' in r) {
            cmps.push(l.cmp(r));
        } else if (!('cmp' in l) && !('cmp' in r)) {
            cmps.push(compare(l, r));
        } else {
            throw Error(`Can't compare ${l} and ${r}, while comparing ${lhs} and ${rhs}`);
        }
    }

    for (var idx in cmps) {
        if (cmps[idx] !== Ordering.Equals) {
            return cmps[idx];
        }
    }
    return Ordering.Equals;
}

export interface Ord<T> extends Eq<T> {
    cmp: (rhs: T) => Ordering;
}

export interface Show {
    toString: () => string;
}


export interface Position extends Ord<Position>, Show {
    line: number;
    column: number;
}


export interface Region extends Ord<Region>, Show {
    start: Position;
    end: Position;
}


export interface LocationId {
    getId: () => string;
}


export interface Kind {
    kind: string;
}


export function kindCast<T extends Kind>(target: T, source: Kind): Result<T> {
    if (target.kind === source.kind) {
        return success(source as T);
    }
    return fail(`Can't cast from ${source.kind} to ${target.kind}`);
}


export interface FileLocation extends Ord<Location>, Show, LocationId {
    kind: "file";
    filename: string;
    project?: string;
}


export interface Package extends Ord<Package>, Show {
    name: string;
    version?: string;
    packageId(): string;
}


export enum PredefinedPackageDb {
    GlobalDb,
    UserDb
}


export interface CustomPackageDb extends Eq<CustomPackageDb>, Show {
    path: string;
}


export type PackageDb = PredefinedPackageDb | CustomPackageDb;


export function serializePackageDb(packageDb: PackageDb): string {
    if (typeof(packageDb) === 'number') {
        switch (packageDb) {
            case PredefinedPackageDb.GlobalDb: return "global-db";
            case PredefinedPackageDb.UserDb: return "user-db";
        }
    } else {
        return `package-db:${packageDb.path}`;
    }
}

export function parsePackageDb(packageDb: string): Result<PackageDb> {
    switch (packageDb) {
        case "global-db": return success(PredefinedPackageDb.GlobalDb);
        case "user-db": return success(PredefinedPackageDb.UserDb);
    }
    const rx = /^package-db:(?<path>.*?)$/;
    let m = rx.exec(packageDb);
    if (m !== null) {
        let groups = (m as any).groups;
        if (groups && groups.path) {
            return success(new CustomPackageDb(groups.path));
        }
    }
    return fail(`Unable parse package-db: ${packageDb}`);
}


export interface InstalledLocation extends Ord<Location>, Show, LocationId {
    kind: "installed";
    name: string;
    pkg: Package;
}


export interface OtherLocation extends Ord<Location>, Show, LocationId {
    kind: "other";
    source: string;
}


export type Location = FileLocation | InstalledLocation | OtherLocation;


export interface ModuleId extends Ord<ModuleId>, Show {
    name: string;
    location: Location;
    exposed: boolean;
}


export interface SymbolId extends Ord<SymbolId>, Show {
    name: string;
    module: ModuleId;
}


export interface Import extends Show {
    module: string;
    qualified: boolean;
    importAs: string | null;
    position: Position;
    location?: Location;
    scopeName(): string;
}


export interface Module extends ModuleId {
    exports: SymbolId[];
    imports: Import[];
    lastInspectionTime: string | null;
}


export enum SymbolType {
    Function,
    Method,
    Selector,
    Constructor,
    Type,
    NewType,
    Data,
    Class,
    TypeFam,
    DataFam,
    PatConstructor,
    PatSelector
}


// Mappings from/to string representations of `SymbolType` in command results
const symbolTypesNames = new Map<SymbolType, string>([
    [SymbolType.Function, "function"],
    [SymbolType.Method, "method"],
    [SymbolType.Selector, "selector"],
    [SymbolType.Constructor, "ctor"],
    [SymbolType.Type, "type"],
    [SymbolType.NewType, "newtype"],
    [SymbolType.Data, "data"],
    [SymbolType.Class, "class"],
    [SymbolType.TypeFam, "type-family"],
    [SymbolType.DataFam, "data-family"],
    [SymbolType.PatConstructor, "pat-ctor"],
    [SymbolType.PatSelector, "pat-selector"],
]);

const symbolTypesNamesInv = new Map<string, SymbolType>(
    Array.from(symbolTypesNames.entries()).map(([s, n]: [SymbolType, string]) => ([n, s] as [string, SymbolType]))
);


export function serializeSymbolType(symbolType: SymbolType): string {
    return symbolTypesNames[symbolType];
}

export function parseSymbolType(symbolType: string): Result<SymbolType> {
    let ty = symbolTypesNamesInv.get(symbolType);
    return defined(ty, `Invalid symbolType: ${symbolType}`);
}


export interface Symbol extends SymbolId {
    symbolType: SymbolType;
    docs?: string;
    position?: Position;
    importedFrom?: ModuleId;
    qualifier?: string;
    functionType?: string;
    typeContext?: string[];
    typeArgs?: string[];
    brief(short: boolean): string;
    detailed(): string;
}


export interface SymbolUsage extends Show {
    symbol: Symbol;
    qualifier?: string;
    usedIn: ModuleId;
    usedRegion: Region;
}


export class CustomPackageDb implements CustomPackageDb {
    public constructor(public path: string) {}
    public toString(): string {
        return serializePackageDb(this);
    }
    public eq(rhs: CustomPackageDb) {
        return this.path === rhs.path;
    }
}


export class Position implements Position {
    public constructor(
        public line: number,
        public column: number
    ) {}

    public toString(): string {
        if (!this.column) {
            return `${this.line}`;
        }
        return `${this.line}:${this.column}`;
    }

    public cmp(rhs: Position): Ordering {
        return lexicCompare([this.line, this.column], [rhs.line, rhs.column]);
    }

    public static parse(value: any): Result<Position> {
        if (!value) {
            return fail(`Empty value: ${JSON.stringify(value)}`);
        }
        return traverseAny({
            line: defined<number>(value.line),
            column: defined<number>(value.column)
        }).map(({ line, column }) => new Position(line, column));
    }
}


export class Region implements Region {
    public constructor(
        public start: Position,
        public end: Position
    ) {}

    public static createWord(start: Position, length: number): Region {
        let end = new Position(start.line, start.column + length);
        return new Region(start, end);
    }

    public toString(): string {
        return `${this.start}-${this.end}`;
    }

    public cmp(rhs: Region): Ordering {
        return lexicCompare([this.start, this.end], [rhs.start, rhs.end]);
    }

    public static parse(value: any): Result<Region> {
        if (!value) {
            return fail(`Empty region object: ${JSON.stringify(value)}`);
        }
        let p = {
            start: Position.parse(value.from),
            end: Position.parse(value.to)
        };
        return traverseAny(p).map(({ start, end }) => {
            return new Region(start, end);
        });
    }
}


export class FileLocation implements FileLocation {
    public constructor(
        public filename: string,
        public project?: string
    ) {}

    public toString(): string {
        return this.filename;
    }

    public cmp(rhs: Location): Ordering {
        return kindCast<FileLocation>(this, rhs)
            .map((r) => compare(this.filename, r.filename))
            .unwrap(compare(this.kind, rhs.kind));
    }

    public getId(): string { return this.filename; }

    public static parse(value: any): Result<FileLocation> {
        if (!value) {
            return fail(`Empty location object: ${JSON.stringify(value)}`);
        }
        return defined(value.file, `File not specified for location object: ${JSON.stringify(value)}`).map(f => {
            return new FileLocation(f, value.project);
        });
    }
}


export class InstalledLocation implements InstalledLocation {
    public constructor(
        public name: string,
        public pkg: Package
    ) {}

    public toString(): string {
        return `${this.name} in ${this.pkg}`;
    }

    public cmp(rhs: Location): Ordering {
        return kindCast<InstalledLocation>(this, rhs)
            .map(r => lexicCompare([this.name, this.pkg], [r.name, r.pkg]))
            .unwrap(compare(this.kind, rhs.kind));
    }

    public getId(): string { return `${this.name}:${this.pkg.packageId()}`; }

    public static parse(value: any): Result<InstalledLocation> {
        if (!value) {
            return fail(`Empty location object`);
        }
        return traverseAny({
            name: defined<string>(value.name, `No name of installed location: ${JSON.stringify(value)}`),
            pkg: defined(value.package, `No package of installed location: ${JSON.stringify(value)}`).bind(Package.parse)
        }).map(({ name, pkg }) => new InstalledLocation(name, pkg));
    }
}


export class Package implements Package {
    public constructor(
        public name: string,
        public version?: string
    ) {}

    public packageId(): string {
        return this.version ? `${this.name}-${this.version}` : this.name;
    }

    public toString(): string {
        return this.version ? `${this.name}-${this.version}` : this.name;
    }

    public cmp(rhs: Package): Ordering {
        return lexicCompare([this.name, this.version], [rhs.name, rhs.version]);
    }

    public static parse(value: any): Result<Package> {
        const rx = /^(?<name>.*?)(?:-(?<version>\d+(?:\.\d+)*))?$/;
        if (typeof(value) === 'string') {
            let m = rx.exec(value);
            if (m !== null) {
                let groups = (m as any).groups;
                return success(new Package(groups.name, groups.version));
            } else {
                return fail(`Unable parse package (should be in form <name>-<ver>): ${JSON.stringify(value)}`);
            }
        } else {
            return fail(`Package should be string, but got: ${JSON.stringify(value)}`);
        }
    }
}


export class ModuleId implements ModuleId {
    public constructor(
        public name: string,
        public location: Location,
        public exposed: boolean = true
    ) {}

    public toString(): string {
        return `ModuleId(${this.name} at ${this.location})`;
    }

    public cmd(rhs: ModuleId): Ordering {
        return lexicCompare([this.name, this.location], [rhs.name, rhs.location]);
    }

    public static parse(value: any): Result<ModuleId> {
        if (!value) {
            return fail(`Empty module id object: ${JSON.stringify(value)}`);
        }
        return traverseAny({
            name: defined<string>(value.name),
            location: selectOne<Location>([FileLocation.parse(value.location), InstalledLocation.parse(value.location)]),
            exposed: defined(value.exposed).unwrap(true)
        }).map(({ name, location, exposed }) => new ModuleId(name, location, exposed));
    }
}


export class SymbolId implements SymbolId {
    public constructor(
        public name: string,
        public module: ModuleId
    ) {}

    public toString(): string {
        return `SymbolId(${this.name} in ${this.module})`;
    }

    public cmp(rhs: SymbolId): Ordering {
        return lexicCompare([this.name, this.module], [rhs.name, rhs.module]);
    }

    public static parse(value: any): Result<SymbolId> {
        if (!value) {
            return fail(`Empty symbol id object: ${JSON.stringify(value)}`);
        }
        return traverseAny({
            name: defined<string>(value.name),
            module: ModuleId.parse(value.module)
        }).map(({ name, module }) => new SymbolId(name, module));
    }
}


export class Symbol extends SymbolId implements Symbol {
    public docs?: string;
    public position?: Position;
    public qualifier?: string;
    public functionType?: string;
    public typeContext?: string[];
    public typeArgs?: string[];

    public constructor(
        public symbolType: SymbolType,
        public name: string,
        public module: ModuleId,
        { docs, position, qualifier, functionType, typeContext, typeArgs } : {
            docs?: string,
            position?: Position,
            qualifier?: string,
            functionType?: string,
            typeContext?: string[],
            typeArgs?: string[]
        }
    ) {
        super(name, module);
        this.docs = docs;
        this.position = position;
        this.qualifier = qualifier;
        this.functionType = functionType;
        this.typeContext = typeContext;
        this.typeArgs = typeArgs;
    }

    public brief(short: boolean = false): string {
        switch (this.symbolType) {
            case SymbolType.Function:
            case SymbolType.Method:
            case SymbolType.Selector:
            case SymbolType.Constructor:
            case SymbolType.PatSelector:
                return this.functionType ? `${this.name} :: ${this.functionType}` : this.name;

            case SymbolType.Type:
            case SymbolType.NewType:
            case SymbolType.Data:
            case SymbolType.Class:
                let keyword = SymbolType[this.symbolType].toLowerCase();
                if (short) {
                    let parts: string[] = [keyword, this.name];
                    if (this.typeArgs) {
                        parts.push(...this.typeArgs);
                    }
                    return parts.join(' ');
                } else {
                    let parts: string[] = [keyword];
                    if (this.typeContext) {
                        parts.push(this.typeContext.length === 1 ? `${this.typeContext[0]} =>` : `(${this.typeContext.join(', ')}) =>`);
                    }
                    parts.push(this.name);
                    if (this.typeArgs) {
                        parts.push(...this.typeArgs);
                    }
                    return parts.join(' ');
                }

            case SymbolType.TypeFam:
            case SymbolType.DataFam:
            case SymbolType.PatConstructor:
                return this.name;
        }
    }
    public detailed(): string {
        let lines: string[] = [this.brief()];
        if (this.docs) {
            lines.push('');
            lines.push(this.docs);
        }
        lines.push('');

        if (this.position) {
            lines.push(`Defined at: ${(this.module.location as FileLocation).filename}:${this.position.line}:${this.position.column}`);
        } else {
            lines.push(`Defined in ${this.module.name}`);
        }
        return lines.join('\n');
    }

    public scopeName(): string {
        return this.qualifier ? `${this.qualifier}.${this.name}` : this.name;
    }

    public toString(): string {
        return `Symbol(${this.symbolType} ${this.name} in ${this.module})`;
    }

    public cmp(rhs: Symbol): Ordering {
        return lexicCompare([this.name, this.module, this.symbolType], [rhs.name, rhs.module, rhs.symbolType]);
    }

    public static parse(value: any): Result<Symbol> {
        if (!value) {
            return fail(`Empty symbol object: ${JSON.stringify(value)}`);
        }
        if (!value.info) {
            return fail(`No field with symbol info`);
        }
        return traverseAny({
            sid: SymbolId.parse(value.id),
            pos: 'pos' in value ? Position.parse(value.pos) : success(null) as Result<Position | null>,
            what: parseSymbolType(value.info.what),
            functionType: 'type' in value.info ? defined<string>(value.info.type) : success(null),
            typeContext: 'ctx' in value.info ? defined<string[]>(value.info.ctx) : success(null),
            typeArgs: 'args' in value.info ? defined<string[]>(value.info.args) : success(null)
        }).map(({ sid, pos, what, functionType, typeContext, typeArgs }) => new Symbol(
            what, sid.name, sid.module,
            {
                docs: value.docs, position: pos, qualifier: value.qualifier,
                functionType: functionType, typeContext: typeContext, typeArgs: typeArgs
            }
        ));
    }
}


export class SymbolUsage implements SymbolUsage {
    public constructor(
        public symbol: Symbol,
        public usedIn: ModuleId,
        public usedRegion: Region,
        public qualifier?: string
    ) {}

    public toString(): string {
        return `SymbolUsage(${this.symbol} in ${this.usedIn} at ${this.usedRegion})`;
    }

    public static parse(value: any): Result<SymbolUsage> {
        if (!value) {
            return fail(`Empty symbol usage object`);
        }
        return traverseAny({
            sym: Symbol.parse(value.symbol),
            mod: ModuleId.parse(value.in),
            rgn: Region.parse(value.at)
        }).map(({ sym, mod, rgn }) => new SymbolUsage(sym, mod, rgn, value.qualifier));
    }
}


export class Import implements Import {
    public constructor(
        public module: string,
        public qualified: boolean,
        public importAs: string | null,
        public position: Position,
        public location?: Location
    ) {}

    public scopeName(): string { return this.importAs ? this.importAs : this.module; }

    public toString(): string {
        return `Import(${this.module})`;
    }

    public static parse(value: any): Result<Import> {
        if (!value || !value.name) {
            return fail(`Empty import object: ${JSON.stringify(value)}`);
        }
        return traverseAny({
            module: defined(value.name as string),
            qualified: 'qualified' in value ? defined(value.qualified as boolean) : success(false),
            importAs: 'as' in value ? defined(value.as as string) : success<string | null>(null),
            position: Position.parse(value.pos)
        }).map(({module, qualified, importAs, position}) => new Import(
            module, qualified, importAs, position
        ));
    }
}


export class Module extends ModuleId implements Module {
    public constructor(
        public name: string,
        public location: Location,
        public exposed: boolean = true,
        public exports: SymbolId[] = null,
        public imports: Import[] = null,
        public lastInspectionTime: string = null
    ) {
        super(name, location, exposed);
    }

    public toString(): string {
        return `Module(${this.name} at ${this.location} with ${this.exports.length} exports, ${this.imports.length} imports)`;
    }

    public static parse(value: any): Result<Module> {
        if (!value) {
            return fail(`Empty module object`);
        }
        return traverseAny({
            mid: ModuleId.parse(value.id),
            exports: 'exports' in value ? parseList(Symbol.parse)(value.exports) : success<Symbol[]>([]),
            imports: 'imports' in value ? parseList(Import.parse)(value.imports) : success<Import[]>([]),
        }).map(({mid, exports, imports}) => new Module(
            mid.name, mid.location, null, exports, imports
        ));
    }
}


export function parseList<T>(p: Parser<T>): Parser<T[]> {
    return (value: any) => {
        return traverse(value.map(el => { return p(el); }));
    };
}
