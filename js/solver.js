// Solver: does a depth-first traversal of the tree of possible expressions.
//
// Every expression over digits d0 d1 d2 d3 (kept in order) is a binary tree:
//   - each internal branch is an operator  + - * / // % ^
//   - parentheses are exactly the choice of where each branch splits
//     (there are 5 ways to bracket four numbers)
//   - a leaf is one digit, or a run of adjacent digits read as one
//     number (4 2 → 42); like Python, a multi-digit number can't start with 0
//   - any branch or leaf may carry a unary minus
//
// Two rules keep the search finite (no infinite loops):
//   1. Parentheses come only from the tree shape, so "((x))" and "(x)"
//      are the same branch and are never generated twice.
//   2. Each node gets at most one unary minus, because −(−x) = x.
//      A value already reached is never added again, which also stops
//      chains like −(−(−x)).
//   ^ and ** are the same operator, so the search tries it once.
//
// explore(i, j) returns every value reachable from digits i..j, with one
// expression that reaches it. Results are memoised per digit range, so the
// whole tree (every grouping of the digits into numbers × every bracketing
// × 7 operators per branch × a minus sign per node) is covered in a few
// milliseconds.

import * as R from './rational.js';

const SEARCH_OPS = ['+', '-', '*', '/', '^', '//', '%'];
const FN = {
  '+': R.add, '-': R.sub, '*': R.mul, '/': R.div,
  '^': R.pow, '//': R.floordiv, '%': R.mod,
};

const num = (v) => ({ type: 'num', v });
const negNode = (c) => ({ type: 'neg', c });
const bin = (op, l, r) => ({ type: 'bin', op, l, r });

export function solve(digits, target = 10, { maxSolutions = 3 } = {}) {
  const memo = new Map();
  const goal = R.int(target);
  const negGoal = R.neg(goal);

  function explore(i, j) {
    const id = i * 16 + j;
    if (memo.has(id)) return memo.get(id);
    const out = new Map();
    // digits i..j read as a single number
    const text = digits.slice(i, j + 1).join('');
    if (i === j || digits[i] !== 0) {
      const v = { n: BigInt(text), d: 1n };
      out.set(R.key(v), { v, node: num(text) });
    }
    {
      for (let s = i; s < j; s++) {
        const left = explore(i, s), right = explore(s + 1, j);
        for (const a of left.values()) {
          for (const b of right.values()) {
            for (const op of SEARCH_OPS) {
              const v = FN[op](a.v, b.v);
              if (R.isErr(v)) continue;          // ÷0, irrational, too big: dead branch
              const k = R.key(v);
              if (!out.has(k)) out.set(k, { v, node: bin(op, a.node, b.node) });
            }
          }
        }
      }
    }
    // Unary minus on this node: at most once (rule 2 above).
    for (const e of [...out.values()]) {
      const v = R.neg(e.v), k = R.key(v);
      if (!out.has(k)) out.set(k, { v, node: negNode(e.node) });
    }
    memo.set(id, out);
    return out;
  }

  // Top level: gather a handful of distinct routes to the target, then keep
  // the simplest-looking ones.
  const last = digits.length - 1;
  const found = [];
  const whole = digits.join('');
  if ((last === 0 || digits[0] !== 0) && BigInt(whole) === BigInt(target)) found.push(num(whole));
  outer:
  for (let s = 0; s < last; s++) {
    const left = explore(0, s), right = explore(s + 1, last);
    for (const a of left.values()) {
      for (const b of right.values()) {
        for (const op of SEARCH_OPS) {
          const v = FN[op](a.v, b.v);
          if (R.isErr(v)) continue;
          if (R.eq(v, goal)) found.push(bin(op, a.node, b.node));
          else if (R.eq(v, negGoal)) found.push(negNode(bin(op, a.node, b.node)));
          if (found.length >= 400) break outer;
        }
      }
    }
  }

  const seen = new Set();
  const solutions = found
    .map((node) => ({ node, text: toText(node), score: score(node) }))
    .sort((x, y) => x.score - y.score || x.text.length - y.text.length)
    .filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)))
    .slice(0, maxSolutions);

  return { solvable: solutions.length > 0, solutions };
}

// How "fancy" an expression looks; lower is shown first.
const OP_COST = { '+': 0, '-': 0, '*': 0, '/': 1, '^': 2, '//': 3, '%': 3 };
function score(n) {
  if (n.type === 'num') return n.v.length > 1 ? 1 : 0;   // plain digits first
  if (n.type === 'neg') return 3 + score(n.c);
  return OP_COST[n.op] + score(n.l) + score(n.r);
}

// ---------- printing ----------

const PRETTY = { '+': '+', '-': '−', '*': '×', '/': '÷', '//': '//', '%': '%', '^': '^', neg: '−' };
const PYTHON = { '+': '+', '-': '-', '*': '*', '/': '/', '//': '//', '%': '%', '^': '**', neg: '-' };

function prec(n) {
  if (n.type === 'num') return 9;
  if (n.type === 'neg') return 3;
  if (n.op === '^') return 4;
  return n.op === '+' || n.op === '-' ? 1 : 2;
}

// True if every operator along n's same-precedence left spine is in `ops`
function chainOnly(n, ops) {
  const p = prec(n);
  while (n.type === 'bin' && prec(n) === p) {
    if (!ops.includes(n.op)) return false;
    n = n.l;
  }
  return true;
}

// Prints with only the parentheses needed under Python precedence, plus a few
// extra for readability: around negative right-hand operands and around any
// exponent or base that isn't a single digit.
export function toText(n, style = 'pretty') {
  const S = style === 'python' ? PYTHON : PRETTY;
  const sp = ' ';
  const wrap = (s) => `(${s})`;
  const go = (n) => {
    if (n.type === 'num') return String(n.v);
    if (n.type === 'neg') return S.neg + (n.c.type === 'num' ? go(n.c) : wrap(go(n.c)));
    const l = go(n.l), r = go(n.r);
    if (n.op === '^') {
      return `${n.l.type === 'num' ? l : wrap(l)}${S['^']}${n.r.type === 'num' ? r : wrap(r)}`;
    }
    const p = prec(n);
    const leftNeeds = prec(n.l) < p;
    // a + (b − c) = a + b − c and a × (b ÷ c) = a × b ÷ c, but
    // a × (b // c) ≠ a × b // c, so only drop parens when it's safe.
    const assocOk = n.op === '+' || (n.op === '*' && chainOnly(n.r, ['*', '/']));
    const rightNeeds = n.r.type === 'neg' || prec(n.r) < p || (prec(n.r) === p && !assocOk);
    return `${leftNeeds ? wrap(l) : l}${sp}${S[n.op]}${sp}${rightNeeds ? wrap(r) : r}`;
  };
  return go(n);
}

export function randomDigits(rng = Math.random) {
  return Array.from({ length: 4 }, () => Math.floor(rng() * 10));
}

// Draw random four-digit numbers until one is solvable.
export function newPuzzle(rng = Math.random) {
  for (let tries = 1; ; tries++) {
    const digits = randomDigits(rng);
    const result = solve(digits);
    if (result.solvable) return { digits, tries, ...result };
  }
}
