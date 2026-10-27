"""Independent cross-check of the JavaScript solver and parser, using Python
itself as the reference for precedence and for %, //, ** semantics.

Run from the project root (after `node tests/solver.test.js`):
    python3 tests/crosscheck.py [puzzles_to_brute_force]

1. Every solution the JS solver printed is evaluated by Python and must be 10.
2. Fuzz: thousands of random expressions are printed with Python's own
   precedence rules; JS must parse and evaluate each one to the same value.
3. Brute force: for a sample of puzzles (including ones the JS solver calls
   unsolvable), literally enumerate every tree — every grouping of digits into
   numbers x every bracketing x 7 operators per branch x unary minus on every
   node — and compare solvability.
"""

import itertools
import re
import json
import multiprocessing as mp
import random
import subprocess
import sys
from fractions import Fraction as F
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BITS = 4096


class Dead(Exception):
    pass


# ---------- reference arithmetic (Fraction + same exactness rules) ----------

def bits(f):
    return max(abs(f.numerator).bit_length(), f.denominator.bit_length())


def chk(f):
    if bits(f) > MAX_BITS:
        raise Dead("overflow")
    return f


def iroot(x, k):
    if x < 2:
        return x
    r = round(x ** (1.0 / k)) if x < 2 ** 1000 else None
    if r is not None:
        for c in (r - 1, r, r + 1):
            if c >= 0 and c ** k == x:
                return c
        return None
    lo, hi = 0, 1 << (x.bit_length() // k + 2)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if mid ** k <= x:
            lo = mid
        else:
            hi = mid - 1
    return lo if lo ** k == x else None


def rpow(a, b):
    if b.denominator == 1:
        e = b.numerator
        if e == 0:
            return F(1)
        if a == 0:
            if e < 0:
                raise Dead("zero")
            return F(0)
        if a in (1, -1):
            return a ** e
        if abs(e) > MAX_BITS or bits(a) * abs(e) > MAX_BITS + 64:
            raise Dead("overflow")
        return chk(a ** e)
    if a < 0:
        raise Dead("complex")
    if a == 0:
        if b < 0:
            raise Dead("zero")
        return F(0)
    if a == 1:
        return F(1)
    q, p = b.denominator, b.numerator
    if q > 64:
        raise Dead("inexact")
    rn, rd = iroot(a.numerator, q), iroot(a.denominator, q)
    if rn is None or rd is None:
        raise Dead("inexact")
    return rpow(F(rn, rd), F(p))


def apply(op, a, b):
    try:
        if op == '+': return chk(a + b)
        if op == '-': return chk(a - b)
        if op == '*': return chk(a * b)
        if op == '/': return chk(a / b)
        if op == '//': return F(a // b)
        if op == '%': return chk(a % b)
        if op == '^': return rpow(a, b)
    except ZeroDivisionError:
        raise Dead("zero")
    raise ValueError(op)


OPS = ['+', '-', '*', '/', '^', '//', '%']


# ---------- 1. printed solutions evaluate to 10 in Python ----------

def check_printed(solutions):
    bad = 0
    count = 0
    for digits, entry in solutions.items():
        for text in entry["python"]:
            count += 1
            # Substitute exact Fractions for each digit so / is exact
            src = re.sub(r'\d+', lambda m: f'F({m.group()})', text)
            try:
                val = eval(src, {"F": F})
            except Exception as e:  # noqa: BLE001
                print("PRINTED FAIL", digits, text, repr(e))
                bad += 1
                continue
            if isinstance(val, (F, int)) and val == 10:  # // gives int
                continue
            if isinstance(val, float) and abs(val - 10) < 1e-9:
                continue
            print("PRINTED FAIL", digits, text, "=", val)
            bad += 1
    print(f"[1] {count} printed solutions evaluated in Python: {count - bad} equal 10")
    return bad


# ---------- 2. fuzz the JS parser against Python's own precedence ----------

# Precedence levels: atom 5 > power 4 > unary 3 > term 2 > arith 1
def show(node, rng, py):
    kind = node[0]
    if kind == 'num':
        s, lvl = (f'F({node[1]})' if py else str(node[1])), 5
    elif kind == 'neg':
        inner, il = show(node[1], rng, py)
        s, lvl = '-' + (inner if il >= 3 else f'({inner})'), 3
    else:
        op, l, r = node[1], node[2], node[3]
        ls, ll = show(l, rng, py)
        rs, rl = show(r, rng, py)
        if op == '^':
            need_l, need_r, lvl = 5, 3, 4
            sym = '**' if py else rng.choice(['^', '**'])
        elif op in '+-':
            need_l, need_r, lvl, sym = 1, 2, 1, op
        else:
            need_l, need_r, lvl, sym = 2, 3, 2, op
        if ll < need_l: ls = f'({ls})'
        if rl < need_r: rs = f'({rs})'
        sp = '' if py else rng.choice(['', ' '])
        s = f'{ls}{sp}{sym}{sp}{rs}'
    if node[-1]:  # redundant parentheses chosen at generation time
        s, lvl = f'({s})', 5
    return s, lvl


def gen(rng, leaves):
    if leaves == 1:
        node = ('num', rng.choice([rng.randint(0, 9), rng.randint(0, 9), rng.randint(10, 99), rng.randint(100, 999)]))
    else:
        k = rng.randint(1, leaves - 1)
        node = ('bin', rng.choice(OPS), gen(rng, k), gen(rng, leaves - k))
    for _ in range(rng.choice([0, 0, 0, 1, 1, 2])):
        node = ('neg', node + (False,))
    return node + (rng.random() < 0.12,)


def tree_val(node):
    kind = node[0]
    if kind == 'num':
        return F(node[1])
    if kind == 'neg':
        return -tree_val(node[1])
    return apply(node[1], tree_val(node[2]), tree_val(node[3]))


def fuzz(n=4000, seed=7):
    rng = random.Random(seed)
    items = []
    while len(items) < n:
        t = gen(rng, rng.randint(1, 5))
        try:
            want = tree_val(t)
            kind = 'value'
        except Dead as e:
            want, kind = None, str(e)
        game_src, _ = show(t, rng, py=False)
        py_src, _ = show(t, random.Random(0), py=True)
        # Python's own parse of the printed string must agree with the tree
        if kind == 'value':
            pv = eval(py_src, {"F": F})
            assert pv == want or (isinstance(pv, float) and abs(pv - float(want)) <= 1e-9 * max(1, abs(pv))), (py_src, want, pv)
        items.append({"src": game_src, "kind": kind, "want": None if want is None else [str(want.numerator), str(want.denominator)]})
    # Simple node bridge: read items on stdin, print results as JSON
    script = (
        "import('./js/parser.js').then(async ({parse, evaluate}) => {"
        " const R = await import('./js/rational.js');"
        " let buf=''; process.stdin.on('data', d => buf += d);"
        " process.stdin.on('end', () => {"
        "  const items = JSON.parse(buf);"
        "  const out = items.map(it => { try { const v = evaluate(parse(it.src).tree);"
        "   return R.isErr(v) ? {err: v} : {n: v.n.toString(), d: v.d.toString()}; }"
        "   catch (e) { return {parse: e.message}; } });"
        "  process.stdout.write(JSON.stringify(out)); }); });"
    )
    res = subprocess.run(["node", "-e", script], input=json.dumps(items), capture_output=True, text=True, cwd=ROOT, check=True)
    got = json.loads(res.stdout)
    errmap = {"zero": "ZERO", "complex": "COMPLEX", "inexact": "INEXACT", "overflow": "OVERFLOW"}
    bad = 0
    for it, g in zip(items, got):
        if it["kind"] == 'value':
            ok = g.get("n") == it["want"][0] and g.get("d") == it["want"][1]
        else:
            ok = g.get("err") == errmap[it["kind"]]
        if not ok:
            bad += 1
            if bad <= 10:
                print("FUZZ FAIL", it, g)
    kinds = {}
    for it in items:
        kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
    print(f"[2] {len(items)} random expressions {kinds}: {len(items) - bad} match Python")
    return bad


# ---------- 3. literal brute force over the whole expression tree ----------

def shapes(n):
    """All binary bracketings of n leaves (as nested tuples of leaf counts)."""
    if n == 1:
        return ['L']
    out = []
    for k in range(1, n):
        for a in shapes(k):
            for b in shapes(n - k):
                out.append((a, b))
    return out




def groupings(digits):
    """Every way to join adjacent digits into numbers (no leading zeros)."""
    n = len(digits)
    for cuts in range(1 << (n - 1)):
        groups, cur = [], str(digits[0])
        for i in range(1, n):
            if cuts >> (i - 1) & 1:
                groups.append(cur)
                cur = str(digits[i])
            else:
                cur += str(digits[i])
        groups.append(cur)
        if all(len(g) == 1 or g[0] != '0' for g in groups):
            yield [int(g) for g in groups]


def brute_solvable(digits):
    for nums in groupings(digits):
        k = len(nums)
        if k == 1:
            if nums[0] == 10:
                return True
            continue
        nodes = 2 * k - 1
        for shape in shapes(k):
            for ops in itertools.product(OPS, repeat=k - 1):
                # unary minus on every non-root node; the root's sign is
                # covered by accepting -10
                for mask in range(1 << (nodes - 1)):
                    it_nums = iter(nums)
                    it_ops = iter(ops)
                    bit = [0]

                    def ev(s):
                        if s == 'L':
                            v = F(next(it_nums))
                        else:
                            a = ev(s[0])
                            b = ev(s[1])
                            v = apply(next(it_ops), a, b)
                        if s is not shape:
                            if mask >> bit[0] & 1:
                                v = -v
                            bit[0] += 1
                        return v

                    try:
                        v = ev(shape)
                    except Dead:
                        continue
                    if v == 10 or v == -10:
                        return True
    return False


def brute_one(d):
    return d, brute_solvable([int(c) for c in d])


def main():
    sample_size = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    solutions = json.loads((ROOT / "tests/out/solutions.json").read_text())
    failures = check_printed(solutions)
    failures += fuzz()

    rng = random.Random(2242)
    unsolv = sorted(d for d, e in solutions.items() if not e["solvable"])
    solv = sorted(d for d, e in solutions.items() if e["solvable"])
    sample = rng.sample(unsolv, sample_size // 2) + rng.sample(solv, sample_size - sample_size // 2)
    with mp.Pool() as pool:
        results = pool.map(brute_one, sample)
    mism = [(d, s) for d, s in results if s != solutions[d]["solvable"]]
    for d, s in mism:
        print("BRUTE MISMATCH", d, "brute force says", s, "JS says", solutions[d]["solvable"])
    print(f"[3] brute-forced {len(sample)} puzzles ({sample_size // 2} the JS solver rejects): {len(sample) - len(mism)} agree")
    failures += len(mism)
    print("ALL CROSS-CHECKS PASSED" if not failures else f"{failures} FAILURE(S)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
