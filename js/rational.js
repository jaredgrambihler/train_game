// Exact rational arithmetic on BigInt, with Python-style semantics for
// %, // and ** so the game agrees with what Python would compute.
//
// Every operation returns either a Rat {n, d} (d > 0, reduced) or an error
// code string: 'ZERO' (division by zero), 'COMPLEX' (negative base with a
// fractional power), 'INEXACT' (irrational result, e.g. 2^(1/2)) or
// 'OVERFLOW' (bigger than MAX_BITS — keeps 9^9^9 from freezing the phone).

export const MAX_BITS = 4096;

const abs = (x) => (x < 0n ? -x : x);

function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function bitLen(x) {
  x = abs(x);
  if (x === 0n) return 0;
  const h = x.toString(16);   // exact bit length, same as Python's int.bit_length()
  return (h.length - 1) * 4 + (32 - Math.clz32(parseInt(h[0], 16)));
}

export function make(n, d = 1n) {
  if (d === 0n) return 'ZERO';
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  if (g > 1n) { n /= g; d /= g; }
  if (bitLen(n) > MAX_BITS || bitLen(d) > MAX_BITS) return 'OVERFLOW';
  return { n, d };
}

export const int = (k) => ({ n: BigInt(k), d: 1n });
const ZERO = { n: 0n, d: 1n };
const ONE = { n: 1n, d: 1n };

export const isErr = (v) => typeof v === 'string';
export const key = (v) => `${v.n}/${v.d}`;
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const neg = (a) => ({ n: -a.n, d: a.d });

export const add = (a, b) => make(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => make(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => make(a.n * b.n, a.d * b.d);
export const div = (a, b) => (b.n === 0n ? 'ZERO' : make(a.n * b.d, a.d * b.n));

// floor(n/d) for d > 0
function floorQ(n, d) {
  let q = n / d;
  if (n % d !== 0n && n < 0n) q -= 1n;
  return q;
}

// Python a // b: floor of the true quotient
export function floordiv(a, b) {
  const q = div(a, b);
  if (isErr(q)) return q;
  return { n: floorQ(q.n, q.d), d: 1n };
}

// Python a % b = a - b * floor(a / b); result takes the sign of b
export function mod(a, b) {
  const f = floordiv(a, b);
  if (isErr(f)) return f;
  const p = mul(b, f);
  return isErr(p) ? p : sub(a, p);
}

function powInt(a, e) {
  if (e === 0n) return ONE;
  if (a.n === 0n) return e > 0n ? ZERO : 'ZERO';
  if (a.d === 1n && (a.n === 1n || a.n === -1n)) {
    return a.n === -1n && abs(e) % 2n === 1n ? int(-1) : ONE;
  }
  const m = abs(e);
  const bits = Math.max(bitLen(a.n), bitLen(a.d));
  if (m > BigInt(MAX_BITS) || bits * Number(m) > MAX_BITS + 64) return 'OVERFLOW';
  let n = a.n ** m, d = a.d ** m;
  if (e < 0n) [n, d] = [d, n];
  return make(n, d);
}

// Exact integer k-th root of x >= 0, or null if x is not a perfect power.
function iroot(x, k) {
  if (x < 2n) return x;
  if (x < 2n ** 53n) {
    const r = BigInt(Math.round(Number(x) ** (1 / Number(k))));
    for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c ** k === x) return c;
    return null;
  }
  let lo = 0n, hi = 1n << (BigInt(Math.ceil(bitLen(x) / Number(k))) + 1n);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid ** k <= x) lo = mid; else hi = mid - 1n;
  }
  return lo ** k === x ? lo : null;
}

// a ** b. Integer exponents are exact. Fractional exponents p/q are exact
// only when a is a perfect q-th power (8^(1/3) = 2); otherwise 'INEXACT'.
export function pow(a, b) {
  if (b.d === 1n) return powInt(a, b.n);
  if (a.n < 0n) return 'COMPLEX';
  if (a.n === 0n) return b.n > 0n ? ZERO : 'ZERO';
  if (a.n === 1n && a.d === 1n) return ONE;
  if (b.d > 64n) return 'INEXACT';
  const rn = iroot(a.n, b.d), rd = iroot(a.d, b.d);
  if (rn === null || rd === null) return 'INEXACT';
  return powInt({ n: rn, d: rd }, b.n);
}

export function toNumber(a) {
  return Number(a.n) / Number(a.d);
}

// Human-friendly value: "10", "-3", "7/2 (3.5)", "1/3 (0.3333)"
export function format(a, minus = '−') {
  const sign = a.n < 0n ? minus : '';
  const n = abs(a.n);
  if (a.d === 1n) return sign + n.toString();
  const frac = `${sign}${n}/${a.d}`;
  if (bitLen(n) > 64 || bitLen(a.d) > 64) return frac;
  let dec = Math.abs(toNumber(a)).toPrecision(4);
  dec = dec.includes('e') ? dec : dec.replace(/\.?0+$/, '');
  return `${frac} (${sign}${dec})`;
}

export const ERROR_TEXT = {
  ZERO: "Can't divide by zero.",
  COMPLEX: 'A negative number to a fractional power isn’t a real number.',
  INEXACT: 'That power doesn’t come out to an exact number.',
  OVERFLOW: 'That number is too big for the tracks.',
};
