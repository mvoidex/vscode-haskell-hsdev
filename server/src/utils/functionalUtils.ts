export function zipWith<TX, TY, TResult>(xs: Array<TX>, ys: Array<TY>, combine: (TX, TY) => TResult): Array<TResult> {
    let result = new Array<TResult>();
    for (var i = 0; i < xs.length && i < ys.length; i++) {
        var x = xs[i];
        var y = ys[i];
        result.push(combine(x, y));
    }
    return result;
}
