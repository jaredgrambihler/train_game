// Parses and evaluates a player's answer with Python's precedence rules:
//
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/' | '//' | '%') unary)*
//   unary  := '-' unary | power
//   power  := atom (('^' | '**') unary)?      right-associative
//   atom   := DIGIT | '(' expr ')'
//
// So -2^2 is -4 (like Python's -2**2), 2^3^2 is 2^9, and 2^-1 is allowed.
// Adjacent digits combine into one number ("42"); like Python, a number
// with more than one digit can't start with 0.

import * as R from './rational.js';

export class ParseError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

const OPS = {
  '+': R.add, '-': R.sub, '*': R.mul, '/': R.div,
  '//': R.floordiv, '%': R.mod, '^': R.pow,
};

export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c >= '0' && c <= '9') {
      // adjacent digits form one number: 4 2 → 42
      let j = i;
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++;
      const text = src.slice(i, j);
      if (text.length > 1 && text[0] === '0') {
        throw new ParseError(`A number can’t start with 0 (“${text}”). Put an operator after the 0.`, i);
      }
      out.push({ t: 'num', v: text, pos: i });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '**') { out.push({ t: 'op', v: '^', pos: i }); i += 2; continue; }
    if (two === '//') { out.push({ t: 'op', v: '//', pos: i }); i += 2; continue; }
    const one = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/', '%': '%', '^': '^' }[c];
    if (one) { out.push({ t: 'op', v: one, pos: i }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c, pos: i }); i++; continue; }
    throw new ParseError(`“${c}” isn’t an allowed symbol.`, i);
  }
  return out;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (...vs) => peek() && peek().t === 'op' && vs.includes(peek().v);

  function expr() {
    let node = term();
    while (isOp('+', '-')) { const op = toks[p++].v; node = { type: 'bin', op, l: node, r: term() }; }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp('*', '/', '//', '%')) { const op = toks[p++].v; node = { type: 'bin', op, l: node, r: unary() }; }
    return node;
  }
  function unary() {
    if (isOp('-')) { p++; return { type: 'neg', c: unary() }; }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp('^')) { p++; return { type: 'bin', op: '^', l: base, r: unary() }; }
    return base;
  }
  function atom() {
    const t = peek();
    if (!t) throw new ParseError('The expression isn’t finished yet.', src.length);
    if (t.t === 'num') { p++; return { type: 'num', v: t.v }; }
    if (t.t === '(') {
      p++;
      const inner = expr();
      if (!peek() || peek().t !== ')') throw new ParseError('A “(” is missing its “)”.', peek() ? peek().pos : src.length);
      p++;
      return inner;
    }
    if (t.t === ')') throw new ParseError('There’s a “)” with nothing before it.', t.pos);
    throw new ParseError(`Expected a digit or “(” before “${t.v}”.`, t.pos);
  }

  const tree = expr();
  if (p < toks.length) {
    const t = toks[p];
    if (t.t === ')') throw new ParseError('There’s an extra “)”.', t.pos);
    throw new ParseError(t.t === 'num' ? 'Put an operator between the numbers.' : 'Put an operator before that “(”.', t.pos);
  }
  // every digit used, in order (42 contributes 4 then 2)
  return { tree, digits: toks.filter((t) => t.t === 'num').flatMap((t) => [...t.v].map(Number)) };
}

// Returns a Rat or an error code string (see rational.js)
export function evaluate(node) {
  if (node.type === 'num') return { n: BigInt(node.v), d: 1n };
  if (node.type === 'neg') {
    const v = evaluate(node.c);
    return R.isErr(v) ? v : R.neg(v);
  }
  const a = evaluate(node.l);
  if (R.isErr(a)) return a;
  const b = evaluate(node.r);
  if (R.isErr(b)) return b;
  return OPS[node.op](a, b);
}

// Full check of a player's answer against the puzzle digits.
// Returns { ok, value?, message }.
export function checkAnswer(src, digits, target = 10) {
  let parsed;
  try { parsed = parse(src); } catch (e) {
    if (e instanceof ParseError) return { ok: false, message: e.message };
    throw e;
  }
  const want = digits.join(' ');
  if (parsed.digits.join(' ') !== want) {
    if (parsed.digits.length < digits.length) return { ok: false, message: `Use all four digits: ${want}.` };
    return { ok: false, message: `Use each digit once, in order: ${want}.` };
  }
  const value = evaluate(parsed.tree);
  if (R.isErr(value)) return { ok: false, message: R.ERROR_TEXT[value] };
  if (R.eq(value, R.int(target))) return { ok: true, value, message: 'Doors closing!' };
  return { ok: false, value, message: `That comes to ${R.format(value)}, not ${target}.` };
}
