# Next Stop: 10

A Chicago "L" themed number puzzle for phones. You get four digits; keep them
in order and add operators to make exactly 10.

`2 2 4 2` → `2 + 2 + 4 + 2` or `2 × 2 + 4 + 2`
`1 4 2 9` → `1 % 42 + 9`

Operators: `+ − × ÷`, `//` (floor divide), `%` (remainder), `^` or `**`
(power). Parentheses and a unary minus can go anywhere, and adjacent digits
can join into one number (`42`), as long as it doesn't start with 0. Every puzzle shown has
at least one answer.

It's plain HTML/CSS/JavaScript with no build step and no server-side code.
It installs to the home screen on iPhone and Android and works offline.

## Play it locally

```bash
python3 -m http.server 8000
# open http://localhost:8000 (or http://<your-computer-ip>:8000 on your phone)
```

Offline mode and install only turn on over HTTPS (or localhost), so test those
on the GitHub Pages URL.

## Put it on GitHub Pages

```bash
git init
git add .
git commit -m "Next Stop: 10"
git branch -M main
git remote add origin https://github.com/<you>/next-stop-ten.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from
a branch → Branch: `main`, folder `/ (root)` → Save.** After a minute it's live
at `https://<you>.github.io/next-stop-ten/`. All paths are relative, so it works
from that subfolder.

**When you change files**, bump `VERSION` in `sw.js` (e.g. `nextstop10-v2`).
Phones cache the game for offline play; the new version tells them to refresh.

## Add it to a phone

- **iPhone (Safari):** Share → Add to Home Screen
- **Samsung S22 (Chrome or Samsung Internet):** menu → Add to Home screen / Install app

It opens full screen with its own icon, and saves your streak on the device.

## How the solver works (`js/solver.js`)

Each expression is a tree: leaves are the digits in order (a single digit, or
a run of adjacent digits read as one number like `42`), each branch is an
operator, parentheses are the choice of where each branch splits (5 ways to
bracket four numbers), and any node can carry a unary minus. The solver walks
that tree depth-first, memoising the set of values reachable from each run of
digits.

Two rules keep the search finite:

1. Parentheses only come from the tree shape, so `((x))` is never a new branch.
2. Each node gets at most one unary minus, since `−(−x) = x`; a value already
   reached is never added again.

That covers the whole space (every grouping of digits into numbers × every
bracketing × 7 operators per branch × a minus sign per node) in a few ms per
puzzle. A new game draws random four-digit numbers until one is solvable:
9,357 of the 10,000 possible numbers are.

## Math rules

The game follows Python. `/` is true division, `//` floors, `%` takes the sign
of the divisor, `^` and `**` are both power and stack right to left
(`2^3^2 = 2^9`), `−2^2 = −4`, and a multi-digit number can't start with 0
(`07` is a syntax error in Python too). Arithmetic is exact (fractions, not
floating point), so `(1 ÷ 3) × 3 × 10` really is 10. Fractional powers count
only when they come out exact (`8^(1/3) = 2`); results over 4,096 bits are
treated as dead ends so a phone never freezes on `9^9^9`.

## Tests

```bash
node tests/solver.test.js     # all 10,000 puzzles + parser cases
python3 tests/crosscheck.py   # independent check against Python itself
```

The Python check evaluates every printed solution with Python, fuzzes the
parser with 4,000 random expressions against Python's own precedence, and
brute-forces a sample of puzzles by literally enumerating every tree.

## Files

```
index.html             page
css/style.css          theme and layout
js/app.js              game flow, keypad, sounds, saved stats
js/solver.js           tree search, puzzle generator, solution printer
js/parser.js           parses and checks the player's answer
js/rational.js         exact fraction arithmetic with Python semantics
js/stations.js         "L" lines, colors, and stations
sw.js                  offline cache
manifest.webmanifest   home-screen install
icons/                 app icons
tests/                 test scripts
```

The line colors and station names are from the Chicago "L"; the train, icons
and layout are original artwork, and the game isn't affiliated with the CTA.
