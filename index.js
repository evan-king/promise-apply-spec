/*
 * PromiseApplySpec
 * 
 * @license MIT
 * @author Evan King
 * @copyright 2018
 */
(function(root, factory) {
    /* istanbul ignore next */
    if(typeof define == 'function' && define.amd) define('promise-apply-spec', ['ramda'], factory);
    else if(typeof module == 'object' && module.exports) module.exports = factory(require('ramda'));
    /* istanbul ignore next */
    else root.portableFP = factory(root.R);
}(typeof self == 'undefined' ? this : /* istanbul ignore next */ self, function(R) {
    
    const id = x => x;
    const assign = Object.assign;

    const throwErrors = R.converge(
        (msg, errs) => { throw assign(new Error(msg), {errors: errs}); },
        [R.pipe(
            R.map(err => R.defaultTo(''+err, err.message)),
            R.prepend('Promises rejected:'),
            R.join('\n - '),
        ),
        id]
    )

    const setter = R.compose(R.set, R.lensPath);
    const reporter = (list, path) => err => {
        if(R.is(Error, err)) err.path = path.join('.');
        list.push(err);
    }

    function getOperations(path, data) {
        
        const toFunctionItem = path.length
            ? v => ({path: path, fn: v})
            : id;
        
        const toPromiseItem = path.length
            ? v => ({path: path, p: v})
            : id;
        
        const toChildItems = asArray => R.pipe(
            R.keys,
            asArray ? R.map(Number) : id,
            R.chain(key => getOperations(R.append(key, path), data[key]))
        );
        
        return R.cond([
            [R.is(Function),     toFunctionItem],
            [R.has('prototype'), R.always([])],
            [R.is(Promise),      toPromiseItem],
            [R.is(Array),        toChildItems(true)],
            [R.is(Object),       toChildItems(false)],
            [R.T,                R.always([])],
        ])(data);
    }
    
    const setDefault = (prop, val) => R.over(R.lensProp(prop), R.defaultTo(val));
    
    const setDefaults = R.pipe(
        R.defaultTo({}),
        setDefault('resolve', true),
        setDefault('apply', true),
        setDefault('once', false),
    );
    
    function applySpecP(data, args, options) {
        
        args = R.defaultTo([], args);
        if(!R.is(Array, args)) throw new TypeError('applySpecP args must be an array');
        options = setDefaults(options);
        
        const wrap = options.resolve ? Promise.resolve.bind(Promise) : id;
        if(!data) return wrap(data);
        
        const next = options.once ? id : d => applySpecP(d, args, options);
        
        const ops = getOperations([], data);
        if(R.is(Promise, ops)) return ops.then(next);
        
        if(R.is(Function, ops)) return next(ops.apply(null, args));
        
        const asyncOps = options.resolve ? R.filter(R.has('p'), ops) : [];
        const syncOps = options.apply ? R.filter(R.has('fn'), ops) : [];
        
        if(syncOps.length + asyncOps.length == 0) return wrap(data);
        
        const errors = [];
        function syncUpdate(acc, op) {
            try {
                return R.assocPath(op.path, op.fn.apply(null, args), acc);
            } catch(ex) {
                if(R.is(Error, ex)) ex.path = op.path.join('.');
                throw ex;
            }
        };
        const asyncUpdate = op => op.p.then(setter(op.path), reporter(errors, op.path));
        const applyUpdates = R.reduce(R.applyTo, data);
        const then = options.resolve ? fn => p => p.then(fn) : id;
        
        const resolvePromises = R.pipe(
            () => R.map(asyncUpdate, asyncOps),
            Promise.all.bind(Promise),
            then(function(updateFns) {
                if(errors.length) throwErrors(errors);
                return applyUpdates(updateFns);
            }),
        );
        
        return R.pipe(
            options.resolve
                ? resolvePromises
                : () => data,
            syncOps.length
                ? then(R.reduce(syncUpdate, R.__, syncOps))
                : id,
            then(next)
        )();
        
    }
    
    function Fluent(opts) {
        opts = opts || {};
        return {
            repeat: v => Fluent(R.merge(opts, {once: !v})),
            apply: v => Fluent(R.merge(opts, {apply: !!v})),
            resolve: v => Fluent(R.merge(opts, {resolve: !!v})),
            applyTo: v => Fluent(R.merge(opts, {apply: true, args: v})),
            withSpec: v => Fluent(R.merge(opts, {spec: v})),
            exec: (spec, args, options) => applySpecP(
                spec || opts.spec,
                args || opts.args,
                options || opts
            )
        }
    }
    
    const tacit = {
       all: v => applySpecP(v, undefined, {apply: false}),
       once: v => applySpecP(v, undefined, {apply: false, once: true}),
       applySpec: R.curry((v, args) => applySpecP(v, args, {resolve: false, once: true})),
       unravel: R.curry((v, args) => applySpecP(v, args)),
       unravelOnce: R.curry((v, args) => applySpecP(v, args, {once: true})),
    };

    return assign(applySpecP, {applySpecP: applySpecP}, tacit, Fluent());

}));
