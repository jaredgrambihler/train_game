import { newPuzzle } from './solver.js';
import { checkAnswer } from './parser.js';
import { LINES, lineStart, stopAt } from './stations.js';

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'), digits: $('digits'), expr: $('expr'), value: $('value'), msg: $('msg'),
  keypad: $('keypad'), nextKey: $('nextKey'), check: $('checkBtn'), reveal: $('revealBtn'),
  newBtn: $('newBtn'), train: $('train'), help: $('help'), helpBtn: $('helpBtn'), sound: $('soundBtn'),
  line: $('lineSelect'), stopCount: $('stopCount'), prev: $('prevStop'), now: $('nowStop'), next: $('nextStop'),
  streak: $('streak'), best: $('best'), rides: $('rides'),
};

// ---------- saved progress (per device; works without it too) ----------
const STORE = 'nextstop10:v1';
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      pos: state.pos, streak: state.streak, best: state.best, rides: state.rides,
      muted: state.muted, seenHelp: state.seenHelp,
    }));
  } catch { /* storage unavailable: progress lasts for this visit */ }
}

const saved = load();
const state = {
  pos: saved.pos ?? 0, streak: saved.streak ?? 0, best: saved.best ?? 0, rides: saved.rides ?? 0,
  muted: saved.muted ?? false, seenHelp: saved.seenHelp ?? false,
  puzzle: null, tokens: [], solved: false, revealed: false, routeIdx: -1, busy: false,
};

// ---------- display helpers ----------
const PRETTY = { '-': '−', '*': '×', '/': '÷', '^': '^', '//': '//', '%': '%', '+': '+', '(': '(', ')': ')' };
const isDigitTok = (t) => /^\d$/.test(t);
const isBinaryCtx = (prev) => prev !== undefined && (isDigitTok(prev) || prev === ')');

function exprHTML(tokens) {
  return tokens.map((t, i) => {
    if (isDigitTok(t) || t === '(' || t === ')') return t;
    if (t === '-' && !isBinaryCtx(tokens[i - 1])) return '−';  // unary minus hugs its number
    return ` ${PRETTY[t]} `;
  }).join('').replace(/ {2,}/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');
}

// Adjacent digit taps join into one number (4, 2 → 42); everything else is spaced.
const src = () => state.tokens
  .map((t, i) => (i && !(isDigitTok(t) && isDigitTok(state.tokens[i - 1])) ? ' ' : '') + t)
  .join('');
const digitsUsed = () => state.tokens.filter(isDigitTok).length;

// ---------- rendering ----------
function renderStop() {
  const s = stopAt(state.pos);
  els.app.style.setProperty('--line', s.line.color);
  els.app.style.setProperty('--on-line', s.line.on);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.line.color);
  els.line.value = String(s.lineIndex);
  els.stopCount.textContent = `Stop ${s.index + 1} of ${s.length}`;
  els.prev.textContent = s.prev ?? '';
  els.now.textContent = s.station;
  els.next.textContent = s.next ?? 'Transfer';
  els.prev.parentElement.classList.toggle('is-end', !s.prev);
}

function renderDigits() {
  const used = digitsUsed();
  els.digits.innerHTML = '';
  state.puzzle.digits.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'digit' + (i < used ? ' is-used' : '') + (i === used && !state.solved ? ' is-next' : '');
    b.textContent = d;
    b.setAttribute('aria-label', `Digit ${d}${i < used ? ', placed' : i === used ? ', next' : ''}`);
    b.addEventListener('click', () => (i === used ? insert(String(d)) : nope(`Next digit is ${state.puzzle.digits[used] ?? 'already placed'}.`)));
    els.digits.append(b);
  });
}

function render() {
  const used = digitsUsed();
  const p = state.puzzle;
  renderDigits();

  if (state.tokens.length) {
    els.expr.innerHTML = exprHTML(state.tokens) + '<span class="caret"></span>';
  } else {
    els.expr.innerHTML = `<span class="ph">Tap the digits and operators</span><span class="caret"></span>`;
  }
  els.expr.classList.toggle('is-ok', state.solved);

  // No live result while typing: the value (and any green) only appears after
  // Check, so building an expression never gives away whether it's right.
  els.value.textContent = state.solved ? '= 10' : '';
  els.value.classList.toggle('is-ten', state.solved);

  const next = p.digits[used];
  els.nextKey.textContent = next ?? '✓';
  els.nextKey.disabled = next === undefined || state.solved;
  els.nextKey.setAttribute('aria-label', next === undefined ? 'All digits placed' : `Next digit, ${next}`);
  els.check.disabled = state.solved || !state.tokens.length;
  els.reveal.disabled = state.solved;
  els.reveal.textContent = state.revealed && p.solutions.length > 1 ? 'Another route' : 'Show route';
  els.newBtn.textContent = state.solved ? 'Next stop' : 'New train';

  els.streak.textContent = state.streak;
  els.best.textContent = state.best;
  els.rides.textContent = state.rides;
}

function say(text, kind = '') {
  els.msg.className = 'msg' + (kind ? ` is-${kind}` : '');
  els.msg.innerHTML = text;
}

function nope(text) {
  say(text, 'bad');
  els.board ??= els.expr.parentElement;
  els.board.classList.remove('shake');
  void els.board.offsetWidth;
  els.board.classList.add('shake');
  sound.buzz();
  navigator.vibrate?.(30);
}

// ---------- input ----------
function insert(tok) {
  if (state.solved || state.busy) return;
  if (isDigitTok(tok)) {
    const want = state.puzzle.digits[digitsUsed()];
    if (want === undefined) return nope('All four digits are placed.');
    if (Number(tok) !== want) return nope(`Next digit is ${want}. Digits stay in order.`);
  }
  state.tokens.push(tok);
  if (els.msg.classList.contains('is-bad')) say('');
  render();
}

function backspace() {
  if (state.solved || state.busy) return;
  state.tokens.pop();
  say('');
  render();
}

function clearAll() {
  if (state.solved || state.busy) return;
  state.tokens = [];
  say('');
  render();
}

function check() {
  if (state.solved || state.busy || !state.tokens.length) return;
  const r = checkAnswer(src(), state.puzzle.digits);
  if (!r.ok) return nope(r.message);

  state.solved = true;
  state.rides += 1;
  if (!state.revealed) {
    state.streak += 1;
    state.best = Math.max(state.best, state.streak);
  }
  save();
  say(state.revealed ? 'Doors closing. Streak resets after a shown route.' : 'Doors closing! Next stop…', 'ok');
  render();
  sound.chime();
  depart();
}

function reveal() {
  if (state.solved) return;
  const sols = state.puzzle.solutions;
  state.routeIdx = (state.routeIdx + 1) % sols.length;
  if (!state.revealed && state.streak) { state.streak = 0; save(); }
  state.revealed = true;
  say(`One route: <b>${sols[state.routeIdx].text}</b>`, 'route');
  render();
}

function newTrain() {
  if (state.busy) return;
  if (state.solved) { advance(); return; }
  if (state.streak) { state.streak = 0; save(); }
  startPuzzle();
  say('New train. Same stop.');
}

// ---------- train movement ----------
function stepPx() { return els.train.parentElement.clientWidth / 3; }

function depart() {
  state.busy = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  els.train.classList.remove('no-anim');
  els.train.style.transform = `translateX(${stepPx()}px)`;
  setTimeout(() => { state.busy = false; advance(); }, reduce ? 600 : 1500);
}

function advance() {
  state.pos += 1;
  save();
  // the next station slides into the middle as the train "arrives"
  els.train.classList.add('no-anim');
  els.train.style.transform = 'translateX(0)';
  renderStop();
  startPuzzle();
}

function arrive() {
  // new trains roll in from the previous station
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  els.train.classList.add('no-anim');
  els.train.style.transform = `translateX(${-stepPx()}px)`;
  void els.train.offsetWidth;
  els.train.classList.remove('no-anim');
  els.train.style.transform = 'translateX(0)';
}

function startPuzzle() {
  state.puzzle = newPuzzle();
  state.tokens = [];
  state.solved = false;
  state.revealed = false;
  state.routeIdx = -1;
  say('');
  render();
  arrive();
}

// ---------- sound (Web Audio; starts after the first tap) ----------
const sound = (() => {
  let ctx = null;
  const ac = () => {
    if (state.muted) return null;
    try { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const tone = (c, freq, start, dur, type = 'sine', gain = 0.18) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
  };
  return {
    chime() { const c = ac(); if (!c) return; tone(c, 784, 0, 0.7); tone(c, 587, 0.38, 0.9); },  // ding-dong
    buzz() { const c = ac(); if (!c) return; tone(c, 140, 0, 0.18, 'square', 0.06); },
    tap() { const c = ac(); if (!c) return; tone(c, 1200, 0, 0.04, 'triangle', 0.03); },
  };
})();

function renderSound() {
  els.sound.setAttribute('aria-pressed', String(!state.muted));
  els.sound.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on');
}

// Switching lines keeps the puzzle in progress, so it can't be used to skip one.
function changeLine() {
  if (state.busy) { renderStop(); return; }
  state.pos = lineStart(Number(els.line.value));
  save();
  renderStop();
  arrive();
}

// ---------- wiring ----------
els.line.append(...LINES.map((l, i) => new Option(`${l.name} Line`, String(i))));
els.line.addEventListener('change', changeLine);
els.keypad.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  sound.tap();
  if (b.dataset.tok) insert(b.dataset.tok);
  else if (b.dataset.act === 'digit') insert(String(state.puzzle.digits[digitsUsed()]));
  else if (b.dataset.act === 'back') backspace();
  else if (b.dataset.act === 'clear') clearAll();
});
els.check.addEventListener('click', check);
els.reveal.addEventListener('click', reveal);
els.newBtn.addEventListener('click', newTrain);
els.sound.addEventListener('click', () => { state.muted = !state.muted; save(); renderSound(); });

function openHelp() {
  if (typeof els.help.showModal === 'function') els.help.showModal();
  else els.help.setAttribute('open', '');
}
els.helpBtn.addEventListener('click', openHelp);
els.help.addEventListener('close', () => { state.seenHelp = true; save(); });

document.addEventListener('keydown', (e) => {
  if (els.help.open || e.target === els.line || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  const last = state.tokens[state.tokens.length - 1];
  if (/^\d$/.test(k)) insert(k);
  else if (k === '*' && last === '*') { state.tokens.pop(); insert('^'); }   // ** → power
  else if (k === '/' && last === '/') { state.tokens.pop(); insert('//'); }  // // → floor divide
  else if ('+-*/%^()'.includes(k) && k.length === 1) insert(k);
  else if (k === 'Backspace') backspace();
  else if (k === 'Enter') { if (state.solved) newTrain(); else check(); }
  else if (k === 'Escape') clearAll();
  else return;
  e.preventDefault();
});

// ---------- start ----------
renderSound();
renderStop();
startPuzzle();
if (!state.seenHelp) openHelp();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline mode unavailable here */ });
}
