
const
    R = require('ramda'),
    chai = require('chai'),
    expect = chai.expect,
    applySpecP = require('./index');

chai.use(require('chai-as-promised'));

// ensure suite fails if any promise rejection is not captured
process.on('unhandledRejection', function() {
    throw new Error('Unhandled promise rejection');
});

function fail(arg) {
    throw arg || new Error('fail')
}

// Usage: tracked(function(track) {track(p => expect(p).eventually.eql(...), [p]); })
const tracked = test => function() {
    const checks = [], tracker = (fn, ps) => R.map(p => checks.push(fn(p)), ps);
    test(tracker);
    return Promise.all(checks);
}


describe('PromiseApplySpec', function() {
    const include = R.set(R.lensPath([1, 'a']));
    const wrap = Promise.resolve.bind(Promise);
    const twoPointTwo = R.always(2.2);
    const three = () => 3;
    const id = x => x;
    
    const testData = [
        wrap(1),
        {
            a: wrap(2),
            b: three,
            c: {d: [4, wrap(5), 6]},
        },
        [wrap(7), 8],
    ];
    const promisedData = wrap(testData);
    const outputData = [1, {a: 2, b: 3, c: {d: [4, 5, 6]}}, [7, 8]];
    
    
    const extraPromises = {
        a1: wrap(2.1),
        a2: wrap(twoPointTwo)
    };
    const expandingData = include(wrap(extraPromises), testData);
    const unexpandedData = include(extraPromises, outputData);
    const expandedData = include({a1: 2.1, a2: 2.2}, outputData);
    
    const noResolve = (d, args) => applySpecP(d, args, {resolve: false});
    const noApply = (d, args) => applySpecP(d, args, {apply: false});
    const noop = (d, args) => applySpecP(d, args, {apply: false, resolve: false});
    
    const expectResult = val => p => expect(p).eventually.eql(val);
    
    
    describe('applySpecP(spec[, arg[, options]]) ⇒ Promise(data)', function() {
        const root = applySpecP;
        
        it('Is the default export and a named export', function() {
            const def = require('./index')
            const { applySpecP } = require('./index');
            expect(def).a('function').eql(root);
            expect(applySpecP).a('function').eql(root);
        });
        
        it('Ensures user provides appropriate input', function() {
            
            // spec can be anything
            expect(noResolve(Number(5))).eql(Number(5));
            expect(noResolve(true)).eql(true);
            expect(noResolve(false)).eql(false);
            expect(noResolve(null)).eql(null);
            expect(noResolve({})).eql({});
            expect(noResolve([])).eql([]);
            expect(noResolve('blah')).eql('blah');
            
            // args must be an array
            expect(() => applySpecP(testData, 5)).throw(TypeError);
        });
        
        it('Accepts a single promise', function() {
            expect(applySpecP(wrap(5))).eventually.eql(5);
            expect(applySpecP(wrap(id), [5])).eventually.eql(5);
        });
        
        it('Accepts a single function', function() {
            expect(applySpecP(id, [outputData], {resolve: false})).eql(outputData);
            expect(applySpecP(id, [outputData], {resolve: false})).eql(outputData);
            expect(applySpecP(id, [outputData])).eventually.eql(outputData);
            expect(applySpecP(id, [5])).eventually.eql(5);
        });
        
        it('Returns data with no promises or functions to handle, unmodified', function() {
            expect(noop(testData)).eql(testData);
            expect(applySpecP(outputData)).eventually.eql(outputData);
            return promisedData.then(d => expect(noop(promisedData)).eventually.eql(d));
        });
        
        it('Returns a promise only if receiving one or resolving', function() {
            expect(noResolve(outputData)).eql(outputData);
            expect(noResolve(promisedData)).a('Promise');
            return promisedData.then(
                d => expect(noResolve(promisedData))
                    .eventually.eql(R.assocPath([1, 'b'], 3, d))
            );
        });
        
        it('Unwraps promises in arbitrary data structures', function() {
            expect(applySpecP(testData)).eventually.eql(outputData);
        });
        
        it('Recursively unwraps promises within promised results', function() {
            expect(applySpecP(expandingData)).eventually.eql(expandedData);
        });
        
        it('Handles interleaved promises and functions', function() {
            const deep = {
                a: () => wrap({b: v => ({c: wrap(1+v)})}),
                x: wrap({y: () => wrap({z: R.add(1)})})
            };
            const full = {
                a: {b: {c: 2}},
                x: {y: {z: 2}},
            };
            expect(applySpecP(deep, [1])).eventually.eql(full);
        });
        
        it('Adds path of origin to errors thrown in spec functions', function() {
            try {
                applySpecP({a: {b: fail}}, null, {resolve: false});
            } catch(err) {
                expect(err).property('path').eql('a.b');
            }
            
            try {
                applySpecP({a: {b: fail}}, [5], {resolve: false});
            } catch(err) {
                expect(err).eql(5);
            }
        });
        
        it('Captures and aggregates all promise rejections into one error', function() {
            const realError = new Error(2);
            const unreachedRejection = Promise.reject(realError);
            const failingData = R.pipe(
                R.prepend({more: {props: Promise.reject(realError)}}),
                R.append(Promise.reject(0))
            )(testData);
            
            unreachedRejection.catch(id); // else our global hook will catch it
            
            let thrown = false;
            return applySpecP(failingData).catch(function(err) {
                thrown = true;
                expect(err).an('Error');
                expect(err).property('errors').lengthOf(2);
                expect(err.errors).eql([realError, 0]);
                expect(realError).property('path').eql('0.more.props');
            }).then(() => expect(thrown).true);
        });
        
        it('Stops recursively expanding on first iteration with errors', function() {
            const realError = new Error(2);
            const unreachedRejection = Promise.reject(realError);
            const failingData = R.pipe(
                R.prepend(Promise.reject(0)),
                include(wrap({more: unreachedRejection}))
            )(testData);
            
            unreachedRejection.catch(id); // else our global hook will catch it
            
            let thrown = false;
            return applySpecP(failingData).catch(function(err) {
                thrown = true;
                expect(err).an('Error');
                expect(err).property('errors').lengthOf(1);
            }).then(() => expect(thrown).true);
        });
        
        it('Can disable expanding functions', function() {
            expect(noApply(testData)).eventually
                .eql(R.assocPath([1, 'b'], three, outputData));
        });
        
        it('Can disable expanding promises', function() {
            expect(noResolve(testData)).eql(R.assocPath([1, 'b'], 3, testData));
        });
        
        it('Can disable recursive expansion', function() {
            expect(applySpecP(expandingData, null, {once: true}))
                .eventually.eql(unexpandedData);
            
            // only top level of each handled:
            //  - no functions from first promises invoked
            //  - no promises from first functions resolved
            const once = {
                a: wrap({b: v => ({c: wrap(1+v)})}),
                x: {y: () => wrap({z: R.add(1)})}
            };
            const deep = {a: () => once.a, x: wrap(once.x)};
            
            expect(applySpecP(deep, [1], {once: true})).eventually.eql(once);
        });
        
    });
    
    describe('Fluent API', function() {
        const root = applySpecP;
        
        const isFluent = obj => R.map(
            key => expect(obj[key]).a('Function'),
            ['once', 'apply', 'resolve', 'applyTo', 'withSpec']
        );
        
        it('is available from the default import', () => isFluent(applySpecP));
        
        it('executes applySpecP via exec(spec, args, options)', function() {
            expect(root.exec()).eventually.eql(undefined);
        });
        
        it('sets once with `options` or .repeat(bool)', tracked(function(track) {
            const
                inner = {b: wrap(1)},
                outer = {a: wrap(inner)},
                full = {a: {b: 1}},
                single = {a: inner};
            
            track(expectResult(full), [
                root.exec(outer),
                root.exec(outer, null, {once: false}),
                root.repeat(true).exec(outer),
                root.repeat(false).exec(outer, null, {once: false}),
            ]);
            
            track(expectResult(single), [
                root.repeat(false).exec(outer),
                root.exec(outer, null, {once: true}),
                root.repeat(true).exec(outer, null, {once: true}),
            ]);
        }));
        
        it('sets apply with `options` or .apply(bool)', tracked(function(track) {
            const orig = {a: id}, expanded = {a: 1};
            
            track(expectResult(expanded), [
                root.exec(orig, [1]),
                root.exec(orig, [1], {apply: true}),
                root.apply(true).exec(orig, [1]),
                root.apply(false).exec(orig, [1], {apply: true}),
            ]);
            
            track(expectResult(orig), [
                root.exec(orig, [1], {apply: false}),
                root.apply(false).exec(orig, [1]),
                root.apply(true).exec(orig, [1], {apply: false}),
            ]);
        }));
        
        it('sets resolve with `options` or .resolve(bool)', tracked(function(track) {
            const orig = {a: wrap(1)}, expanded = {a: 1};
            
            track(expectResult(expanded), [
                root.exec(orig, [1]),
                root.exec(orig, [1], {resolve: true}),
                root.resolve(true).exec(orig, [1]),
                root.resolve(false).exec(orig, [1], {resolve: true}),
            ]);
            
            track(expectResult(orig), [
                root.exec(orig, [1], {resolve: false}),
                root.resolve(false).exec(orig, [1]),
                root.resolve(true).exec(orig, [1], {resolve: false}),
            ].map(v => wrap(v)));
        }));
        
        it('sets args with `args` or args and apply with .applyTo(args)', tracked(function(track) {
            const orig = {a: id}, expanded = {a: 1}, differentArg = {a: 2};
            
            track(expectResult(expanded), [
                root.exec(orig, [1]),
                root.applyTo([1]).exec(orig),
                root.applyTo([2]).exec(orig, [1]),
                root.apply(false).applyTo([1]).exec(orig),
                root.apply(false).applyTo([3]).exec(orig, [1]),
            ]);
            
            track(expectResult(orig), [
                root.applyTo([1]).apply(false).exec(orig),
                root.applyTo([1]).apply(false).exec(orig, [1]),
            ]);
        }));
        
        it('sets spec with `spec` or .withSpec(spec)', tracked(function(track) {
            const orig = {a: wrap(1)}, expanded = {a: 1};
            
            track(expectResult(expanded), [
                root.exec(orig),
                root.withSpec(orig).exec(),
                root.withSpec('something else').exec(orig),
            ]);
        }));
        
        it('chains immutable instances', tracked(function(track) {
            const orig = {a: id}, expanded = {a: 1}, differentArg = {a: 2};
            const toExpanded = root.withSpec(orig).applyTo([1]);
            const toDifferent = toExpanded.applyTo([2]);
            
            toExpanded.withSpec({}).applyTo([3]).apply(false);
            
            track(expectResult(expanded), [toExpanded.exec()]);
            track(expectResult(differentArg), [toDifferent.exec()]);
        }));
        
    });
    
    describe('Functional API', function() {
        const root = applySpecP;
        
        const isFP = obj => R.map(
            key => expect(obj[key]).a('Function'),
            ['all', 'once', 'applySpec', 'unravel', 'unravelOnce']
        );
        
        it('is available from the default import', () => isFP(applySpecP));
        
        describe('all :: spec → Promise(data)', function() {
            it('only resolves promises, recursively', function() {
                const input = {a: id, b: wrap({c: wrap(1)})};
                expect(root.all(input)).eventually.eql({a: id, b: {c: 1}});
            });
        });
        
        describe('once :: spec → Promise(data)', function() {
            it('only resolves promises, once', function() {
                const inner = wrap(1);
                const input = {a: id, b: wrap({c: inner})};
                expect(root.once(input)).eventually.eql({a: id, b: {c: inner}});
            });
        });
        
        describe('applySpec :: spec → [arg] → data', function() {
            const p = wrap(1);
            const input = {a: R.always(id), b: id, c: p};
                
            it('only resolves functions, once', function() {
                expect(root.applySpec(input, [2])).eql({a: id, b: 2, c: p});
            });
            
            it('is curried', function() {
                expect(root.applySpec(input)([1])).eql({a: id, b: 1, c: p});
            });
        });
        
        describe('unravel :: spec → [arg] → Promise(data)', function() {
                
            it('recursively resolves promises and expands functions', function() {
                const deep = {
                    a: () => wrap({b: v => ({c: wrap(1+v)})}),
                    x: wrap({y: () => wrap({z: R.add(1)})})
                };
                const full = {
                    a: {b: {c: 2}},
                    x: {y: {z: 2}},
                };
                
                expect(root.unravel(deep, [1])).eventually.eql(full);
            });
            
            it('always returns a promise', function() {
                expect(root.unravel(1, [])).eventually.eql(1);
            });
            
            it('is curried', function() {
                expect(root.unravel(1)([])).eventually.eql(1);
            });
        });
        
        describe('unravelOnce :: spec → [arg] → Promise(data)', function() {
                
            it('resolves promises and expands functions, once', function() {
                const once = {
                    a: wrap({b: v => ({c: wrap(1+v)})}),
                    x: {y: () => wrap({z: R.add(1)})}
                };
                const deep = {a: () => once.a, x: wrap(once.x)};
                
                expect(root.unravelOnce(deep, [1])).eventually.eql(once);
            });
            
            it('always returns a promise', function() {
                expect(root.unravelOnce(1, [])).eventually.eql(1);
            });
            
            it('is curried', function() {
                expect(root.unravelOnce(1)([])).eventually.eql(1);
            });
        });
        
    });
    
});
