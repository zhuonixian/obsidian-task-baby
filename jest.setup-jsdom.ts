// Polyfill TextEncoder/TextDecoder for jsdom test env
// (whatwg-url needs these at import time)
const util = require('util');
const g = globalThis as any;
if (!g.TextEncoder) g.TextEncoder = util.TextEncoder;
if (!g.TextDecoder) g.TextDecoder = util.TextDecoder;
