'use strict';

export interface Optional<T> {
    map<U>(fn: (v: T) => U): Result<U>;
    bind<U>(fn: (v: T) => Result<U>): Result<U>;
    unwrap(def: T): T;
    fold<U>(some: (v: T) => U, none: (err: string, details?: any) => U): U;
}

export class Fail<T> implements Optional<T> {
    public constructor(public readonly msg: string, public readonly details?: any) {}
    public map<U>(fn: (v: T) => U): Result<U> {
        return new Fail<U>(this.msg);
    }
    public bind<U>(fn: (v: T) => Result<U>): Result<U> {
        return new Fail<U>(this.msg);
    }
    public unwrap(def: T): T { return def; }
    public fold<U>(some: (v: T) => U, none: (err: string, details?: any) => U): U {
        return none(this.msg, this.details);
    }
}

export class Success<T> implements Optional<T> {
    public constructor(public readonly value: T) {}
    public map<U>(fn: (v: T) => U): Result<U> {
        return new Success(fn(this.value));
    }
    public bind<U>(fn: (v: T) => Result<U>): Result<U> {
        return fn(this.value);
    }
    public unwrap(def: T): T { return this.value; }
    public fold<U>(some: (v: T) => U, none: (err: string, details?: any) => U): U {
        return some(this.value);
    }
}

export function success<T>(value: T): Result<T> {
    return new Success<T>(value);
}

export function fail<T>(msg: string, details?: any): Result<T> {
    return new Fail<T>(msg, details);
}

export type Result<T> = Success<T> | Fail<T>;

type Unwrapped<T> = T extends Result<infer U> ? U : T;

export type Unwrap<T> = {
    [P in keyof T]: Unwrapped<T[P]>
};

export function isFail<T>(result: Result<T>): result is Fail<T> {
    return result instanceof Fail;
}

export function isSuccess<T>(result: Result<T>): result is Success<T> {
    return result instanceof Success;
}

export function defined<T>(value: T | undefined, err?: string): Result<T> {
    return value === undefined ? fail(err ? err : `value is undefined`) : success(value);
}

export function selectOne<T>(alts: Result<T>[]): Result<T> {
    let errs: string[] = [];
    while (alts.length > 0) {
        let el = alts.shift();
        if (isSuccess(el)) {
            return el;
        } else if (isFail(el)) {
            errs.push(el.msg);
        }
    }
    return fail(`all alternatives failed with errors: \n${errs.join('\n')}`);
}

export function traverse<T>(elems: Result<T>[]): Result<T[]> {
    let result: T[] = [];
    let failure: string | null = null;
    while (!failure && elems.length > 0) {
        let el = elems.shift();
        el.fold((v) => { result.push(v); }, (err) => { failure = err; });
    }
    return failure ? fail(failure) : success(result);
}

export function traverseAny<T>(val: T): Result<Unwrap<T>> {
    let result = {} as Unwrap<T>;
    for (const k in val) {
        let v = val[k];
        if (v instanceof Success) {
            result[k] = v.value;
        } else if (v instanceof Fail) {
            return fail(v.msg, v.details);
        } else {
            result[k] = v as Unwrapped<typeof v>;
        }
    }
    return success(result);
}
