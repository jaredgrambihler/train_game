// Run with:  node tests/solver.test.js
// Solves all 10,000 four-digit puzzles, re-checks every solution it prints,
// and runs hand-written parser cases. Writes tests/out/solutions.json for
// the independent Python cross-check (tests/crosscheck.py).

import { mkdirSync, writeFileSync } from 'node:fs';
import { solve, toText } from '../js/solver.js';
import { checkAnswer, parse, evaluate } from '../js/parser.js';
import * as R from '../js/rational.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL', msg); };

// --- hand-written semantics cases (expected values match Python) ---
const cases = [
  ['2+2+4+2', 10], ['2*2+4+2', 10], ['-2**2', -4], ['(-2)^2', 4], ['2^3^2', 512],
  ['2**-1', '1/2'], ['7//2', 3], ['-7//2', -4], ['7//-2', -4], ['-7%3', 2], ['7%-3', -2],
  ['5/2%2', '1/2'], ['8^(1/3)', 2], ['4^(3/2)', 8], ['2 - -3', 5], ['--2', 2], ['2*-3', -6],
  ['9/(1/9)', 81], ['0^0', 1], ['(1/2)^-2', 4], ['7.', 'ERR'], ['22', 22], ['2 2', 'ERR'], ['01', 'ERR'], ['00', 'ERR'], ['0', 0], ['42%5', 2], ['2(3)', 'ERR'],
  ['(2+3', 'ERR'], ['2+3)', 'ERR'], ['2+', 'ERR'], ['1/0', 'ZERO'], ['0^-1', 'ZERO'],
  ['(-8)^(1/3)', 'COMPLEX'], ['2^(1/2)', 'INEXACT'], ['9^9^9', 'OVERFLOW'], ['5%0', 'ZERO'],
];
for (const [src, want] of cases) {
  let got;
  try { const v = evaluate(parse(src).tree); got = R.isErr(v) ? v : R.format(v, '-'); }
  catch { got = 'ERR'; }
  const exp = typeof want === 'number' ? String(want) : want;
  if (!(got === exp || got.startsWith(exp + ' '))) fail(`${src}: got ${got}, want ${exp}`);
}

// --- answer checking ---
const ok = (src, digits, expectOk) => {
  const r = checkAnswer(src, digits);
  if (r.ok !== expectOk) fail(`checkAnswer(${src}, ${digits}) → ${r.ok}: ${r.message}`);
};
ok('2+2+4+2', [2, 2, 4, 2], true);
ok('2*2+4+2', [2, 2, 4, 2], true);
ok('2+4+2+2', [2, 2, 4, 2], false);   // wrong order
ok('2+2+4', [2, 2, 4, 2], false);     // missing digit
ok('2+2+4+2+0', [2, 2, 4, 2], false); // extra digit
ok('22-4-2-2+(2)', [2, 2, 4, 2], false);
ok('1 % 42 + 9', [1, 4, 2, 9], true);   // joined digits
ok('22 - 4 * 2 - 2 * 2', [2, 2, 4, 2, 2, 2], true);
ok('1%42+9', [1, 4, 2, 9], true);
ok('14%2+9', [1, 4, 2, 9], false);   // 0 + 9
ok('0 + 10', [0, 1, 0], true);
ok('0 + 01 + 9', [0, 0, 1, 9], false);   // leading zero

// --- every puzzle ---
const t0 = performance.now();
const out = {};
let solvable = 0, solutionsChecked = 0;
for (let n = 0; n < 10000; n++) {
  const digits = String(n).padStart(4, '0').split('').map(Number);
  const res = solve(digits);
  const id = digits.join('');
  out[id] = { solvable: res.solvable, python: res.solutions.map((s) => toText(s.node, 'python')) };
  if (res.solvable) solvable++;
  for (const s of res.solutions) {
    for (const text of [s.text, toText(s.node, 'python')]) {
      solutionsChecked++;
      const r = checkAnswer(text, digits);
      if (!r.ok) fail(`${id}: printed solution "${text}" re-checks as: ${r.message}`);
    }
  }
}
const ms = performance.now() - t0;
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/solutions.json', import.meta.url), JSON.stringify(out));

console.log(`${solvable} of 10000 puzzles solvable (${10000 - solvable} skipped by the game)`);
console.log(`${solutionsChecked} printed solutions re-checked, avg ${(ms / 10000).toFixed(2)} ms per puzzle`);
console.log(failures ? `${failures} FAILURE(S)` : 'All checks passed');
process.exit(failures ? 1 : 0);
