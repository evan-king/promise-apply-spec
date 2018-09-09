
# promise-apply-spec

[![version][version-img]][version-url]
[![npm][npmjs-img]][npmjs-url]
[![build status][travis-img]][travis-url]
[![Coveralls][coveralls-img]][coveralls-url]
[![deps status][daviddm-img]][daviddm-url]
[![mit license][license-img]][license-url]

PromiseApplySpec is a Promise utility function like `Promise.all` plus Ramda's
`applySpec` for arbitrary raw data structures containing Promises and functions.

## Features

  - Captures and reports all errors from promises with enough detail to trace their
    location in the original structure.
  
  - (Optionally) recursively resolves Promises within promise-resolved leaf structures.
  
  - (Optionally) recursively expands functions in the `spec` with supplied arguments.
  
  - Differing from Ramda, handles structures with strings and classed objects, leaving
    them untouched.
  
  - Offers 3 different API styles (traditional, fluent, functional/tacit).
  
  - Covered by extensive functional testing.

## Basic Usage

```javascript
// Standard API
const applySpecP = require('promise-apply-spec');

const data = [Promise.resolve(1), {a: 2, b: Promise.resolve(3)}];
applySpecP(data); // => Promise([1, {a: 2, b: 3});

const failing = [
    Promise.resolve(1),
    {a: Promise.reject(new Error('two'))},
    Promise.reject({c: 3})
];
applySpecP(failing).catch(function(err) {
    err; // => Error('Promises rejected:\n - two\n - [Object object]')
    err.errors; // => [Error('two'), {c: 3}]
    err.errors[0].path; // => '1.a'
    err.errors[1].path; // => `undefined` (will only mutate Errors)
});

// Fluent API
const applySpecP = require('promise-apply-spec');

applySpecP
    .withSpec(data)
    .exec(); // => Promise([1, {a: 2, b: 3});

// Functional API
const { all, once, applySpec, unravel, unravelOnce } = require('promise-apply-spec');

const spec = {
  a: Promise.resolve(1),
  b: Promise.resolve({c: Promise.resolve(3), d: x => x+1})
};

// expand everything, recursively
unravel(spec, [4]).then(function(data) {
  data; // => {a: 1, b: {c: 3, d: 5}}
});

// expand initial promises and functions only
unravelOnce(spec)([4]).then(function(data) {
  data; // => {a: 1, b: {c: Promise(3), d: 5}}
});

// expand promises only, recursively
all(spec).then(function(data) {
  data; // => {a: 1, b: {c: 3, d: x => x+1}}
});

// expand functions once only
applySpec(spec)([4]); // => spec
applySpec({a: x => x+1}, [4]); // => {a: 5}
```

## API (traditional)

```javascript
const { applySpecP } = require('promise-apply-spec');
```

### applySpecP(spec[, arg[, options]]) ⇒ Promise(data) | data

The fully featured main function &mdash; provided as both the default export and
a named export &mdash; with a traditional, data-first and non-curried signature.

**Params**:
  - **spec**: Any: any combination of nested arrays, plain objects, functions,
    promises, and other values ('other values' that look like plain objects
    containing promises or functions will get recreated as truly plain objects)
    
  - **args**: Array: arguments to pass into invoked `spec` functions
  
  - **options**: Configuration object
    - **apply**: Boolean: whether to replace `spec` functions with their
      invocation &mdash; default `true`
    - **resolve**: Boolean: whether to resolve promises &mdash; default `true`
    - **once**: Boolean: when true, unwraps promises at most once, then expands
      functions at most once, and returns &mdash; default `false`

**Return**:
  - when `options.resolve = true`, a Promise of the resolved and optionally
    function-applied data structure
  - when `options.resolve = false`, the optionally function-expanded data structure


### Fluent API (building operations via method chaining)

```javascript
const Fluent = require('promise-apply-spec');
```

The initial immutable Fluent instance with options `{apply: true, resolve: true, once: false}`.

#### Fluent.applyTo(args) ⇒ Fluent

Get a new immutable Fluent with default `args` provided and `options.apply = true`.

#### Fluent.withSpec(spec) ⇒ Fluent

Get a new immutable Fluent with default `spec` provided.

#### Fluent.repeat(Boolean) ⇒ Fluent

Get a new immutable Fluent with `options.once` reconfigured.

#### Fluent.apply(Boolean) ⇒ Fluent

Get a new immutable Fluent with `options.apply` reconfigured.

#### Fluent.resolve(Boolean) ⇒ Fluent

Get a new immutable Fluent with `options.resolve` reconfigured.

#### Fluent.exec([spec[, args[, once]]]) ⇒ Promise(data) | data

Execute `applySpecP` with all arguments defaulting to the Fluent instance configuration.


### Functional API (auto-curried, data-last functions)

```javascript
const { all, once, applySpec, unravel, unravelOnce } = require('promise-apply-spec');
```

#### all :: spec → Promise(data)

Recursively expands promises, ignores functions.

#### once :: spec → Promise(data)

Expands promises once, ignores functions.

#### applySpec :: spec → [arg] → data

Expands functions once, ignores promises.

#### unravel :: spec → [arg] → Promise(data)

Recursively expands promises and functions.

#### unravelOnce :: spec → [arg] → Promise(data)

Expands promises once, then functions once.


## Related Libraries and Functions

  - [`promise-all`](https://github.com/joakimbeng/promise-all):
    Turns a flat array or object of promises into a promise of the same data structure
    with promises unwrapped.  **Limitations**: only supports flat data (no nested objects
    or arrays), cannot recursively expand promises, does not expand functions.
  
  - [`promise-all-recursive`](https://github.com/usefulthink/promise-all-recursive):
    Turns a data structure containing promises into a promise of the data structure
    with promises recursively unwrapped.  **Limitation**: does not handle promise
    rejections or expand functions.
  
  - [`promise-traverse`](https://github.com/mvaldesdeleon/promise-traverse):
    Turns a data structure containing promises into a promise of the data structure
    with promises unwrapped.  **Limitations**: cannot recursively expand promises,
    does not handle promise rejections or expand functions.
  
  - [`ramda.applySpec`](https://ramdajs.com/docs/#applySpec):
    Turns a `spec` object into a function that returns the same data structure
    but replacing inner functions with their invocation on the supplied argument.
    **Limitations**: only works for `spec` objects containing only non-string
    primitives and functions as leaf nodes, does not resolve promises, and does
    not pass more than one argument to `spec` functions.

[version-url]: https://github.com/evan-king/promise-apply-spec/releases
[version-img]: https://img.shields.io/github/tag/evan-king/promise-apply-spec.svg?style=flat

[npmjs-url]: https://www.npmjs.com/package/promise-apply-spec
[npmjs-img]: https://img.shields.io/npm/v/promise-apply-spec.svg?style=flat

[coveralls-url]: https://coveralls.io/r/evan-king/promise-apply-spec?branch=master
[coveralls-img]: https://img.shields.io/coveralls/evan-king/promise-apply-spec.svg?style=flat

[license-url]: https://github.com/evan-king/promise-apply-spec/blob/master/LICENSE
[license-img]: https://img.shields.io/badge/license-MIT-blue.svg?style=flat

[travis-url]: https://travis-ci.org/evan-king/promise-apply-spec
[travis-img]: https://img.shields.io/travis/evan-king/promise-apply-spec.svg?style=flat

[daviddm-url]: https://david-dm.org/evan-king/promise-apply-spec
[daviddm-img]: https://img.shields.io/david/evan-king/promise-apply-spec.svg?style=flat
