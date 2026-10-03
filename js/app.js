import * as E from './engine/index.js';
import { load, save, exportFile, importFile } from './storage.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

let state = E.migrateState(load());
let tab = 'today';
const ui = {
  stage: null, // null | 'readiness'
  readiness: { sleep: 3, energy: 3, soreness: 3 },
  editing: null, // { ex, set }
  summary: null,
  rest: null, // { end, total }
  cardioTimer: null,
};

// ---------------------------------------------------------------------------
// Helpers

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const units = () => state.profile.units;
const fmtW = (w) => (w == null ? '' : w === 0 ? 'BW' : `${+(+w).toFixed(1)}`);
const fmtE1 = (v) => Math.round(units() === 'kg' ? v * 2 : v) / (units() === 'kg' ? 2 : 1);
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

function persist() {
  if (!save(state)) toast('Could not save to this device. Export a backup from Settings.');
}

function commit(next) {
  state = next;
  persist();
  render();
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function buzz(pattern = 200) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

let audio;
function beep(freq = 880, ms = 250) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* not supported */ }
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (!state) {
    $nav.hidden = true;
    $app.innerHTML = setupView();
    return;
  }
  $nav.hidden = !!state.active;
  $nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const views = { today: todayView, plan: planView, progress: progressView, settings: settingsView };
  $app.innerHTML = state.active ? activeView() : views[tab]();
  tick();
}

// ---------- Setup

function setupView(p = E.defaultProfile()) {
  const liftRow = (key, name, w, r) => `
    <div class="lift-input">
      <div class="lift-name">${name}</div>
      <label>Weight<input type="number" inputmode="decimal" name="${key}-w" value="${w}" min="0" step="any" required></label>
      <label>Reps<input type="number" inputmode="numeric" name="${key}-r" value="${r}" min="1" max="15" required></label>
      <label>RPE<select name="${key}-rpe">${E.RPE_OPTIONS.map((o) => `<option ${o === 8 ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
    </div>`;
  return `
  <section class="hero">
    <h1>Steady Strong</h1>
    <p>Short, smart workouts built on the big lifts, plus cardio that actually improves your heart. The plan adjusts every session based on how hard things feel.</p>
  </section>
  <form id="setup" class="card stack">
    <h2>About you</h2>
    <div class="grid2">
      <label>Units<select name="units"><option value="lb">lb</option><option value="kg">kg</option></select></label>
      <label>Age<input type="number" name="age" value="${p.age}" min="14" max="90" inputmode="numeric" required></label>
      <label>Lifting days / week<select name="liftDays">${[2, 3, 4].map((d) => `<option ${d === p.liftDays ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Cardio days / week<select name="cardioDays">${[0, 1, 2, 3, 4, 5].map((d) => `<option ${d === p.cardioDays ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Session length<select name="length"><option value="standard">Standard (~45 min)</option><option value="short">Short (~30 min)</option></select></label>
      <label>Cardio after lifting<select name="finisher">${finisherOptions(p.finisher)}</select></label>
      <label>Current easy cardio (min)<input type="number" name="z2Start" value="${p.z2Start}" min="10" max="60" step="5" inputmode="numeric"></label>
    </div>
    <h2>A recent set for each lift</h2>
    <p class="muted">Any recent working set works. RPE is how hard it was: 8 means you had about 2 reps left. Guess if unsure; the app corrects itself within a couple of weeks.</p>
    ${liftRow('squat', 'Squat', 185, 5)}
    ${liftRow('bench', 'Bench Press', 135, 5)}
    ${liftRow('deadlift', 'Deadlift', 225, 5)}
    ${liftRow('press', 'Overhead Press', 95, 5)}
    <h2>Weight limits</h2>
    <p class="muted">The heaviest you want to lift. Once a lift gets there, the weight stays put and you work on getting more reps instead. Leave blank for no limit.</p>
    ${capInputs(p.caps)}
    <button class="primary big" type="submit">Build my plan</button>
    <label class="linklike">Restore from backup<input type="file" accept="application/json" data-action="import" hidden></label>
  </form>`;
}

function finisherOptions(cur) {
  return [0, 10, 15, 20].map((m) => `<option value="${m}" ${m === Number(cur) ? 'selected' : ''}>${m ? `${m} min easy` : 'None'}</option>`).join('');
}

function capInputs(caps = {}) {
  return `<div class="grid2">${Object.entries(E.MAIN_LIFTS).map(([k, d]) => `<label>${esc(d.name)}<input type="number" inputmode="decimal" step="any" min="0" name="cap-${k}" value="${caps[k] ?? ''}" placeholder="No limit"></label>`).join('')}</div>`;
}

function readCaps(f) {
  const caps = {};
  for (const k of Object.keys(E.MAIN_LIFTS)) {
    const v = Number(f.get(`cap-${k}`));
    caps[k] = v > 0 ? v : null;
  }
  return caps;
}

// ---------- Today

function todayView() {
  if (ui.summary) return summaryView();
  if (ui.stage === 'readiness') return readinessView();
  const info = E.blockInfo(state.cursor);
  const slot = E.currentSlot(state);
  const session = E.buildSession(state, slot);
  const plan = E.weekPlan(state.profile, state.cursor.week);
  const back = E.isReturningFromBreak(state);
  return `
  <section class="block-banner ${info.deload ? 'deload' : ''}">
    <div class="eyebrow">Block ${info.number} · ${esc(info.name)} · Week ${info.week} of ${E.WEEKS_PER_BLOCK}${info.deload ? ' · Deload' : ''}</div>
    <p>${esc(info.focus)}</p>
  </section>
  ${back ? `<div class="note warn">Welcome back. It's been ${E.daysSinceLastSession(state)} days, so today will start easier.</div>` : ''}
  <section class="card next">
    <div class="eyebrow">Next up · session ${state.cursor.slot + 1} of ${plan.length} this week</div>
    <h2>${esc(session.title)} <span class="pill">${session.minutes} min</span></h2>
    ${sessionPreview(session)}
    <button class="primary big" data-action="begin">Start</button>
    <button class="ghost" data-action="skip">Skip this session</button>
  </section>
  <section class="card">
    <h3>This week</h3>
    <ol class="week">
      ${plan.map((s, i) => {
        const label = s.type === 'lift' ? E.TEMPLATES[state.profile.liftDays][s.day].title : s.kind === 'z2' ? 'Zone 2 cardio' : 'Interval cardio';
        const cls = i < state.cursor.slot ? 'done' : i === state.cursor.slot ? 'current' : '';
        return `<li class="${cls}">${esc(label)}</li>`;
      }).join('')}
    </ol>
    <p class="muted small">Do them in order on whatever days suit you. Aim for at least one rest day between lifting sessions.</p>
  </section>`;
}

function sessionPreview(s) {
  if (s.kind === 'cardio') {
    return `<p>${esc(s.description)}</p><p class="muted small">Target heart rate ${s.hr[0]}-${s.hr[1]} bpm.</p>`;
  }
  return `<ul class="preview">${s.exercises.map((ex) => {
    const first = ex.sets[0];
    let detail;
    if (ex.role === 'main') {
      const bo = ex.sets.filter((x) => x.type === 'backoff');
      detail = `${ex.capped ? 'Cap: ' : ''}${fmtW(first.weight)} × ${first.reps} @ RPE ${first.rpe}${bo.length ? `, then ${bo.length} × ${bo[0].reps} @ ${fmtW(bo[0].weight)}` : ''}`;
    } else if (ex.role === 'secondary') {
      detail = `${ex.sets.length} × ${first.reps} @ ${fmtW(first.weight)}`;
    } else if (ex.role === 'finisher') {
      detail = `${first.reps} min easy`;
    } else {
      detail = accessoryTarget(ex, first);
    }
    return `<li><span class="${ex.role}">${esc(ex.name)}</span><span>${detail}</span></li>`;
  }).join('')}</ul>`;
}

const unitSuffix = (ex) => ({ sec: 's', min: ' min' }[ex.unit] || '');

function accessoryTarget(ex, set) {
  const u = unitSuffix(ex);
  const reps = ex.loaded ? `${ex.range[0]}-${ex.range[1]}${u}` : `${set.reps}${u}`;
  return `${ex.sets.length} × ${reps}${ex.loaded ? ` @ ${fmtW(set.weight)}` : ''}`;
}

function readinessView() {
  const q = (key, label, lo, hi) => `
    <div class="readiness-q">
      <div>${label}</div>
      <div class="chips">${[1, 2, 3, 4, 5].map((n) => `<button class="chip ${ui.readiness[key] === n ? 'on' : ''}" data-action="ready" data-key="${key}" data-val="${n}">${n}</button>`).join('')}</div>
      <div class="scale"><span>${lo}</span><span>${hi}</span></div>
    </div>`;
  const level = E.readinessLevel(ui.readiness);
  return `
  <section class="card stack">
    <h2>Quick check-in</h2>
    <p class="muted">Ten seconds. On rough days the plan backs off so you still train without digging a hole.</p>
    ${q('sleep', 'Sleep last night', 'awful', 'great')}
    ${q('energy', 'Energy right now', 'drained', 'fired up')}
    ${q('soreness', 'Body feels', 'beat up', 'fresh')}
    <div class="note ${level === 'low' ? 'warn' : ''}">${level === 'low' ? 'Easier day: lighter targets and fewer sets. Showing up is the win.' : 'Good to go as planned.'}</div>
    <button class="primary big" data-action="start">Let's go</button>
    <button class="ghost" data-action="cancel-readiness">Back</button>
  </section>`;
}

function summaryView() {
  const s = ui.summary;
  return `
  <section class="card stack">
    <h2>${s.skipped ? 'Session skipped' : 'Nice work'}</h2>
    ${s.notes.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="muted">Logged.</p>'}
    <button class="primary big" data-action="close-summary">Done</button>
  </section>`;
}

// ---------- Active session

function activeView() {
  const { session } = state.active;
  const head = `
  <header class="active-head">
    <div>
      <div class="eyebrow">${esc(session.block)} · Week ${session.week}${session.deload ? ' · Deload' : ''}${session.lowReadiness ? ' · Easy day' : ''}</div>
      <h2>${esc(session.title)}</h2>
    </div>
    <button class="ghost small" data-action="abandon">Cancel</button>
  </header>`;
  return head + (session.kind === 'cardio' ? cardioActive() : liftActive());
}

function liftActive() {
  const { session, log } = state.active;
  const firstAcc = session.exercises.findIndex((ex) => ex.role === 'accessory');
  const cards = session.exercises.map((ex, i) => {
    // Accessories pair up: 1st with 2nd, 3rd on its own.
    const pairsWithNext = ex.role === 'accessory' && (i - firstAcc) % 2 === 0 && session.exercises[i + 1]?.role === 'accessory';
    return exerciseCard(ex, i, log.exercises[i], pairsWithNext);
  }).join('');
  return `${cards}
  <div class="rest-bar" id="rest" hidden></div>
  <button class="primary big" data-action="finish">Finish workout</button>`;
}

function exerciseCard(ex, i, exLog, pairsWithNext) {
  const nextIdx = exLog.sets.findIndex((s, j) => !s && !ex.sets[j].optional);
  const roleLabel = { main: 'Main lift', secondary: 'Volume', accessory: 'Accessory', finisher: 'Cardio' }[ex.role];
  const pairHint = pairsWithNext ? '<div class="muted small">Superset with the next accessory</div>' : '';
  const anyLogged = exLog.sets.some(Boolean);
  const swap = ex.role === 'accessory' && !anyLogged ? `<button class="ghost small" data-action="swap" data-ex="${i}">Swap</button>` : '';
  const capNote = ex.capped ? `<div class="note cap">At your ${fmtW(ex.cap)} ${units()} limit. The weight stays here, so today is about the reps.</div>` : '';
  return `
  <section class="card exercise ${ex.role}">
    <div class="ex-head">
      <div><div class="eyebrow">${roleLabel}</div><h3>${esc(ex.name)}</h3>${ex.note ? `<div class="muted small">${esc(ex.note)}</div>` : ''}${pairHint}</div>
      ${swap}
    </div>
    ${capNote}
    ${ex.lastNote ? `<div class="note coach">${esc(ex.lastNote)}</div>` : ''}
    ${ex.warmup ? `<details class="warmup"><summary>Warm-up sets</summary><ul>${ex.warmup.map((w) => `<li>${fmtW(w.weight)} × ${w.reps}</li>`).join('')}</ul></details>` : ''}
    <ul class="sets">
      ${ex.sets.map((set, j) => setRow(ex, set, exLog.sets[j], i, j, j === nextIdx)).join('')}
    </ul>
  </section>`;
}

function setRow(ex, planned, actual, i, j, isNext) {
  const editing = ui.editing && ui.editing.ex === i && ui.editing.set === j;
  const u = unitSuffix(ex);
  const label = { top: 'Top', backoff: 'Back-off', finisher: 'Cardio' }[planned.type] || `Set ${j + 1}`;
  let target;
  if (ex.role === 'finisher') target = `${planned.reps} min easy`;
  else if (ex.role === 'accessory') target = `${ex.loaded ? `${fmtW(planned.weight)} × ` : ''}${ex.loaded ? `${ex.range[0]}-${ex.range[1]}` : planned.reps}${u}`;
  else target = `${fmtW(planned.weight)} × ${planned.reps} @ ${planned.rpe}`;
  if (editing) return `<li class="set editing">${setEditor(ex, planned, actual, i, j, label)}</li>`;
  if (actual) {
    const miss = actual.reps < (planned.min ?? planned.reps);
    return `<li class="set logged ${miss ? 'miss' : ''}" data-action="edit-set" data-ex="${i}" data-set="${j}">
      <span class="tag">${label}</span><span class="val">✓ ${ex.loaded === false ? '' : `${fmtW(actual.weight)} × `}${actual.reps}${u}${actual.rpe != null ? ` @ ${actual.rpe}` : ''}</span></li>`;
  }
  return `<li class="set ${isNext ? 'next' : ''} ${planned.optional ? 'optional' : ''}" data-action="edit-set" data-ex="${i}" data-set="${j}">
    <span class="tag">${label}${planned.optional ? ' (optional)' : ''}</span><span class="val">${target}</span><span class="go">Log</span></li>`;
}

function setEditor(ex, planned, actual, i, j, label) {
  const cur = actual || { weight: planned.weight, reps: planned.reps, rpe: planned.rpe };
  const step = ex.role === 'accessory' ? E.UNIT_CONFIG[units()].accessoryStep : E.UNIT_CONFIG[units()].step;
  const repStep = ex.unit === 'sec' ? 5 : 1;
  const u = { sec: 'Seconds', min: 'Minutes' }[ex.unit] || 'Reps';
  const fin = ex.role === 'finisher';
  const stepper = (name, value, st, lbl) => `
    <div class="stepper">
      <span class="lbl">${lbl}</span>
      <button type="button" data-action="step" data-name="${name}" data-delta="${-st}">−</button>
      <input id="in-${name}" type="number" inputmode="decimal" step="any" value="${value ?? 0}">
      <button type="button" data-action="step" data-name="${name}" data-delta="${st}">+</button>
    </div>`;
  return `
    <div class="editor">
      <div class="eyebrow">${label} · target ${fin ? `${planned.reps} min` : ex.role === 'accessory' ? (ex.loaded ? `${ex.range[0]}-${ex.range[1]}` : planned.reps) : `${planned.reps} @ RPE ${planned.rpe}`}</div>
      ${ex.loaded !== false ? stepper('weight', cur.weight, step, `Weight (${units()})`) : ''}
      ${stepper('reps', cur.reps, repStep, u)}
      ${fin ? '' : `<div class="lbl">How hard? (RPE)</div>
      <div class="chips rpe">${E.RPE_OPTIONS.map((r) => `<button type="button" class="chip ${r === cur.rpe ? 'on' : ''}" data-action="pick-rpe" data-val="${r}" title="${E.RPE_LABELS[r]}">${r}</button>`).join('')}</div>
      <div class="muted small" id="rpe-desc">${esc(E.RPE_LABELS[cur.rpe] || '')}</div>`}
      <input type="hidden" id="in-rpe" value="${cur.rpe ?? ''}">
      <div class="row">
        <button class="primary" data-action="log-set" data-ex="${i}" data-set="${j}">Log set</button>
        <button class="ghost" data-action="cancel-edit">Close</button>
        ${actual ? `<button class="ghost" data-action="clear-set" data-ex="${i}" data-set="${j}">Clear</button>` : ''}
      </div>
    </div>`;
}

function cardioActive() {
  const { session, log } = state.active;
  const t = ui.cardioTimer;
  const timer = session.cardioType === 'intervals'
    ? `<div class="timer" id="cardio-timer"><div class="phase" id="ct-phase">${t ? '' : 'Ready'}</div><div class="clock" id="ct-clock">${t ? '' : mmss(session.intervals.warmup * 60)}</div><div class="muted small" id="ct-sub"></div></div>`
    : `<div class="timer" id="cardio-timer"><div class="phase" id="ct-phase">Zone 2</div><div class="clock" id="ct-clock">${t ? '' : mmss(session.minutes * 60)}</div><div class="muted small" id="ct-sub">remaining</div></div>`;
  const rpeScale = session.cardioType === 'z2'
    ? 'Easy sessions should feel 3-4 out of 10.'
    : 'Hard intervals should feel about 8 out of 10 by the last rep.';
  return `
  <section class="card stack">
    <p><strong>${esc(session.description)}</strong></p>
    <p class="muted">${esc(session.cue)}</p>
    <p class="muted small">Any machine works: bike, rower, incline walk, jog, elliptical, swim.</p>
    ${timer}
    <div class="row">
      <button class="primary" data-action="timer-toggle">${t && t.running ? 'Pause' : t ? 'Resume' : 'Start timer'}</button>
      ${t ? '<button class="ghost" data-action="timer-reset">Reset</button>' : ''}
    </div>
  </section>
  <section class="card stack">
    <h3>Log it</h3>
    <label class="check"><input type="checkbox" id="c-done" ${log.completed ? 'checked' : ''}> Finished the whole session</label>
    <div class="grid2">
      <label>Minutes<input type="number" id="c-min" inputmode="numeric" value="${esc(log.minutes)}"></label>
      <label>Avg heart rate (optional)<input type="number" id="c-hr" inputmode="numeric" value="${esc(log.avgHr)}" placeholder="bpm"></label>
    </div>
    <div class="lbl">Overall effort (1-10)</div>
    <div class="chips">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="chip ${log.rpe === n ? 'on' : ''}" data-action="cardio-rpe" data-val="${n}">${n}</button>`).join('')}</div>
    <p class="muted small">${rpeScale}</p>
    <button class="primary big" data-action="finish">Finish</button>
  </section>`;
}

// ---------- Plan

function planView() {
  const upcoming = E.projectUpcoming(state, 14);
  let lastWeek = null;
  const parts = [`<section class="intro"><h2>Looking ahead</h2><p class="muted">Projected assuming you hit your targets. Real numbers adjust after every session.</p></section>`];
  for (const u of upcoming) {
    const key = `${u.cursor.block}-${u.cursor.week}`;
    if (key !== lastWeek) {
      const info = E.blockInfo(u.cursor);
      parts.push(`<h3 class="week-head">Block ${info.number} · ${esc(info.name)} · Week ${info.week}${info.deload ? ' · Deload' : ''}</h3>`);
      lastWeek = key;
    }
    parts.push(`<section class="card compact"><div class="plan-title"><strong>${esc(u.session.title)}</strong><span class="pill">${u.session.minutes} min</span></div>${sessionPreview(u.session)}</section>`);
  }
  return parts.join('');
}

// ---------- Progress

function sparkline(points) {
  if (points.length < 2) return '';
  const w = 280, h = 56, pad = 4;
  const vals = points.map((p) => p.e1rm);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals.map((v, i) => `${(pad + (i / (vals.length - 1)) * (w - pad * 2)).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function progressView() {
  const zones = E.heartRateZones(state.profile.age);
  const lifts = Object.entries(E.MAIN_LIFTS).map(([k, def]) => {
    const l = state.lifts[k];
    const first = l.history[0]?.e1rm ?? l.e1rm;
    const diff = l.e1rm - first;
    return `<div class="lift-stat">
      <div class="row between"><strong>${esc(def.name)}</strong><span>${fmtE1(l.e1rm)} ${units()} <span class="${diff >= 0 ? 'up' : 'down'} small">${diff >= 0 ? '+' : ''}${fmtE1(diff)}</span></span></div>
      ${capLine(k, l)}
      ${sparkline(l.history)}
    </div>`;
  }).join('');
  const acc = E.accessoriesForBlock(state.profile, state.cursor.block).map((k) => {
    const def = E.ACCESSORIES[k];
    const st = state.accessories[k];
    const val = def.loaded ? `${fmtW(st.weight)}${st.weight ? ` ${units()}` : ''}` : `${st.target}${def.unit === 'sec' ? 's' : ' reps'}`;
    return `<li><span>${esc(def.name)}</span><span>${val}</span></li>`;
  }).join('');
  const done = state.history.filter((h) => !h.skipped);
  const last28 = done.filter((h) => Date.now() - new Date(h.date) < 28 * 86400000);
  const cardioMin = last28.reduce((a, h) => {
    if (h.session.kind === 'cardio') return a + (Number(h.log?.minutes) || 0);
    const fin = h.session.exercises.findIndex((ex) => ex.role === 'finisher');
    return a + (fin >= 0 ? Number(h.log.exercises[fin].sets[0]?.reps) || 0 : 0);
  }, 0);
  const hist = [...state.history].reverse().slice(0, 30).map((h) => `
    <li><details><summary><span>${fmtDate(h.date)}</span><span>${esc(h.session.title)}${h.skipped ? ' (skipped)' : ''}</span></summary>
    ${historyDetail(h)}</details></li>`).join('');
  return `
  <section class="card">
    <h3>Estimated max</h3>
    <p class="muted small">Your estimated one-rep max, recalculated from every set you log. You never have to test it.</p>
    ${lifts}
  </section>
  <section class="card">
    <h3>Heart</h3>
    <ul class="kv">
      <li><span>Zone 2 session</span><span>${state.cardio.z2Minutes} min</span></li>
      <li><span>Intervals</span><span>${esc(E.intervalLabel(E.INTERVAL_LADDER[state.cardio.intervalRung]))}</span></li>
      <li><span>Zone 2 heart rate</span><span>${zones.z2[0]}-${zones.z2[1]} bpm</span></li>
      <li><span>Interval heart rate</span><span>${zones.hard[0]}-${zones.hard[1]} bpm</span></li>
      <li><span>Cardio, last 4 weeks</span><span>${cardioMin} min</span></li>
    </ul>
  </section>
  <section class="card">
    <h3>Consistency</h3>
    <ul class="kv"><li><span>Sessions, last 4 weeks</span><span>${last28.length}</span></li><li><span>Sessions, all time</span><span>${done.length}</span></li></ul>
  </section>
  <section class="card"><h3>This block's accessories</h3><p class="muted small">These change every 4 weeks.</p><ul class="kv">${acc}</ul></section>
  <section class="card"><h3>History</h3>${hist ? `<ul class="history">${hist}</ul>` : '<p class="muted">Nothing logged yet.</p>'}</section>`;
}

function capLine(k, l) {
  const cap = E.capFor(state.profile, k);
  if (!cap) return '';
  const best = l.atCap && l.atCap.weight === cap ? ` · best: ${l.atCap.reps} reps` : '';
  return `<div class="muted small">Limit ${fmtW(cap)} ${units()}${best}</div>`;
}

function historyDetail(h) {
  if (h.skipped) return '';
  const notes = h.notes?.length ? `<ul class="notes">${h.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  if (h.session.kind === 'cardio') {
    return `<p class="small">${esc(h.log.minutes)} min · effort ${esc(h.log.rpe ?? '-')}/10${h.log.avgHr ? ` · ${esc(h.log.avgHr)} bpm` : ''}${h.log.completed ? '' : ' · cut short'}</p>${notes}`;
  }
  const lines = h.session.exercises.map((ex, i) => {
    const sets = h.log.exercises[i].sets.filter(Boolean);
    if (!sets.length) return '';
    return `<li><span>${esc(ex.name)}</span><span>${sets.map((s) => `${ex.loaded === false ? '' : `${fmtW(s.weight)}×`}${s.reps}`).join(', ')}</span></li>`;
  }).join('');
  return `<ul class="kv small">${lines}</ul>${notes}`;
}

// ---------- Settings

function settingsView() {
  const p = state.profile;
  const opt = (vals, cur, labels = {}) => vals.map((v) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${labels[v] ?? v}</option>`).join('');
  return `
  <form id="settings" class="card stack">
    <h3>Plan settings</h3>
    <div class="grid2">
      <label>Units<select name="units">${opt(['lb', 'kg'], p.units)}</select></label>
      <label>Age<input type="number" name="age" value="${p.age}" min="14" max="90"></label>
      <label>Lifting days / week<select name="liftDays">${opt([2, 3, 4], p.liftDays)}</select></label>
      <label>Cardio days / week<select name="cardioDays">${opt([0, 1, 2, 3, 4, 5], p.cardioDays)}</select></label>
      <label>Session length<select name="length">${opt(['standard', 'short'], p.length, { standard: 'Standard (~45 min)', short: 'Short (~30 min)' })}</select></label>
      <label>Cardio after lifting<select name="finisher">${finisherOptions(p.finisher)}</select></label>
      <label>Longest Zone 2 (min)<input type="number" name="z2Max" value="${p.z2Max}" min="20" max="90" step="5"></label>
    </div>
    <button class="primary" type="submit">Save settings</button>
  </form>
  <form id="caps" class="card stack">
    <h3>Weight limits (${units()})</h3>
    <p class="muted small">At a limit, the weight holds and the target reps climb instead. Leave blank for no limit.</p>
    ${capInputs(p.caps)}
    <button class="primary" type="submit">Save limits</button>
  </form>
  <form id="maxes" class="card stack">
    <h3>Estimated maxes</h3>
    <p class="muted small">Only change these if the weights feel way off. The app normally handles it.</p>
    <div class="grid2">${Object.entries(E.MAIN_LIFTS).map(([k, d]) => `<label>${esc(d.name)}<input type="number" step="any" name="${k}" value="${fmtE1(state.lifts[k].e1rm)}"></label>`).join('')}</div>
    <button class="primary" type="submit">Update maxes</button>
  </form>
  <section class="card stack">
    <h3>Backup</h3>
    <p class="muted small">Your data is stored only on this device. Export a backup now and then.</p>
    <div class="row"><button class="ghost" data-action="export">Export backup</button>
    <label class="button ghost">Import backup<input type="file" accept="application/json" data-action="import" hidden></label></div>
  </section>
  <section class="card stack how">
    <h3>How it works</h3>
    <p><strong>Blocks.</strong> Training runs in 4-week blocks: three weeks that get progressively heavier, then a lighter deload week. Blocks alternate between Build (sets of 8-10) and Strength (sets of 4-6).</p>
    <p><strong>RPE.</strong> After each set, rate how hard it was. RPE 8 means about 2 more reps were possible. Main lifts top out at RPE 8.5, so you train hard without grinding to failure.</p>
    <p><strong>Live adjustments.</strong> If your top set is harder than planned or you miss reps, the back-off sets drop right away. Two grinders in a row and the app tells you to stop that lift for the day.</p>
    <p><strong>Progression.</strong> Hit your targets and your estimated max goes up, so next week is heavier. Miss them and it eases off. Two rough sessions in a row on a lift triggers a 5% reset to rebuild momentum.</p>
    <p><strong>Weight limits.</strong> Once a lift reaches the limit you set, the weight stays there. Getting stronger then shows up as more reps at that weight, up to 12 (10 for deadlifts), and the app tracks your rep records at each limit.</p>
    <p><strong>Accessories</strong> rotate every 4-week block so things stay fresh. Each exercise gets a full block to progress, and its weight is remembered for when it comes back around. Tap Swap during a workout if the equipment is taken. They use double progression: reach the top of the rep range on every set and the weight goes up.</p>
    <p><strong>Cardio.</strong> An optional easy finisher after lifting adds cardio without an extra trip to the gym. When it's on, accessory sets drop to 2 so the session stays short. Zone 2 sessions build your aerobic base, growing 5 minutes at a time up to your cap. Intervals climb a ladder up to the 4×4 protocol, one of the best-studied ways to raise VO2 max, a strong marker of longevity.</p>
    <p><strong>Check-ins.</strong> Poor sleep, low energy or soreness makes that day's session lighter. Missed two weeks? The first session back is eased too.</p>
    <p class="muted small">General fitness guidance, not medical advice. Check with a doctor before starting hard exercise if you have heart, blood pressure or joint concerns.</p>
  </section>
  <section class="card stack">
    <button class="danger" data-action="reset">Erase everything and start over</button>
  </section>`;
}

// ---------------------------------------------------------------------------
// Timers

function tick() {
  const restEl = document.getElementById('rest');
  if (restEl) {
    if (ui.rest) {
      const left = Math.round((ui.rest.end - Date.now()) / 1000);
      if (left <= 0) {
        if (!ui.rest.alerted) { ui.rest.alerted = true; beep(); buzz([200, 100, 200]); }
        restEl.hidden = false;
        restEl.innerHTML = '<span>Rest done. Next set.</span><button class="ghost small" data-action="rest-dismiss">OK</button>';
      } else {
        restEl.hidden = false;
        restEl.innerHTML = `<span>Rest ${mmss(left)}</span><button class="ghost small" data-action="rest-add">+30s</button><button class="ghost small" data-action="rest-dismiss">Skip</button>`;
      }
    } else {
      restEl.hidden = true;
    }
  }
  const t = ui.cardioTimer;
  if (t && document.getElementById('ct-clock')) {
    const elapsed = t.running ? t.elapsed + (Date.now() - t.startedAt) / 1000 : t.elapsed;
    let idx = t.phases.length - 1;
    let start = t.total - t.phases[idx].sec;
    for (let i = 0, acc = 0; i < t.phases.length; acc += t.phases[i].sec, i++) {
      if (elapsed < acc + t.phases[i].sec) { idx = i; start = acc; break; }
    }
    const phase = t.phases[idx];
    const left = Math.max(0, Math.ceil(start + phase.sec - elapsed));
    if (idx !== t.lastIdx) {
      if (t.lastIdx != null) { beep(phase.hard ? 1100 : 660, 400); buzz(phase.hard ? [300, 100, 300] : 300); }
      t.lastIdx = idx;
    }
    const finished = elapsed >= t.total;
    document.getElementById('ct-phase').textContent = finished ? 'Done' : phase.label;
    document.getElementById('ct-phase').className = `phase ${phase.hard && !finished ? 'hard' : ''}`;
    document.getElementById('ct-clock').textContent = finished ? '0:00' : mmss(left);
    document.getElementById('ct-sub').textContent = finished ? 'Log it below' : `${mmss(Math.max(0, Math.round(t.total - elapsed)))} total left`;
    if (finished && t.running) {
      t.elapsed = t.total;
      t.running = false;
      keepAwake(false);
      beep(1320, 600);
      buzz([400, 150, 400]);
      render();
    }
  }
}
setInterval(tick, 500);

function cardioPhases(session) {
  if (session.cardioType === 'z2') return [{ label: 'Zone 2', sec: session.minutes * 60 }];
  const iv = session.intervals;
  const phases = [{ label: 'Warm up easy', sec: iv.warmup * 60 }];
  for (let i = 1; i <= iv.reps; i++) {
    phases.push({ label: `Hard ${i}/${iv.reps}`, sec: iv.work, hard: true });
    if (i < iv.reps) phases.push({ label: 'Easy', sec: iv.rest });
  }
  phases.push({ label: 'Cool down', sec: iv.cooldown * 60 });
  return phases;
}

// ---------------------------------------------------------------------------
// Actions

function startSession() {
  const back = E.isReturningFromBreak(state);
  const level = back ? 'low' : E.readinessLevel(ui.readiness);
  const session = E.buildSession(state, E.currentSlot(state), { readiness: level });
  state.active = { session, log: E.emptyLog(session), readiness: { ...ui.readiness, level }, startedAt: new Date().toISOString() };
  ui.stage = null;
  ui.editing = null;
  ui.rest = null;
  ui.cardioTimer = null;
  if (session.kind === 'lift') {
    const first = session.exercises[0];
    ui.editing = { ex: 0, set: first.sets.length ? 0 : null };
  }
  persist();
  render();
  window.scrollTo(0, 0);
}

function finishSession(skipped = false) {
  const now = new Date();
  let session, log, readiness = null;
  if (skipped) {
    session = E.buildSession(state, E.currentSlot(state));
    log = null;
  } else {
    ({ session, log } = state.active);
    readiness = state.active.readiness;
    if (session.kind === 'cardio') {
      log.completed = document.getElementById('c-done').checked;
      log.minutes = Number(document.getElementById('c-min').value) || 0;
      log.avgHr = document.getElementById('c-hr').value;
      if (log.rpe == null) { toast('Pick an effort rating first.'); return; }
    }
  }
  const { state: next, notes } = E.completeSession(state, session, log, { now, skipped, readiness });
  ui.summary = { notes, skipped };
  ui.editing = null;
  ui.rest = null;
  ui.cardioTimer = null;
  keepAwake(false);
  tab = 'today';
  commit(next);
  window.scrollTo(0, 0);
}

function logSet(i, j) {
  const { session, log } = state.active;
  const ex = session.exercises[i];
  const weightEl = document.getElementById('in-weight');
  const reps = Number(document.getElementById('in-reps').value);
  const rpeVal = document.getElementById('in-rpe').value;
  const entry = {
    weight: weightEl ? Number(weightEl.value) : null,
    reps: Number.isFinite(reps) ? Math.max(0, reps) : 0,
    rpe: rpeVal === '' ? null : Number(rpeVal),
  };
  log.exercises[i].sets[j] = entry;
  const note = E.adjustAfterSet(session, log, i, j, units());
  if (note) ex.lastNote = note;

  // Move to the next set: same exercise first, then the next exercise.
  ui.editing = null;
  outer: for (let a = i; a < session.exercises.length; a++) {
    for (let b = 0; b < session.exercises[a].sets.length; b++) {
      if (!log.exercises[a].sets[b] && !session.exercises[a].sets[b].optional) { ui.editing = { ex: a, set: b }; break outer; }
    }
  }
  const isLast = !ui.editing;
  if (!isLast) ui.rest = { end: Date.now() + ex.rest * 1000 };
  persist();
  render();
  if (isLast) toast('All sets logged. Tap Finish workout.');
  document.querySelector('.set.editing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const i = Number(el.dataset.ex), j = Number(el.dataset.set);
  switch (a) {
    case 'begin':
      ui.stage = 'readiness';
      render();
      break;
    case 'ready':
      ui.readiness[el.dataset.key] = Number(el.dataset.val);
      render();
      break;
    case 'cancel-readiness':
      ui.stage = null;
      render();
      break;
    case 'start':
      startSession();
      break;
    case 'skip':
      if (confirm('Skip this session and move to the next one?')) finishSession(true);
      break;
    case 'close-summary':
      ui.summary = null;
      render();
      break;
    case 'abandon':
      if (confirm('Cancel this workout? Nothing will be saved.')) {
        state.active = null;
        ui.cardioTimer = null;
        ui.rest = null;
        keepAwake(false);
        persist();
        render();
      }
      break;
    case 'edit-set':
      ui.editing = { ex: i, set: j };
      render();
      break;
    case 'cancel-edit':
      ui.editing = null;
      render();
      break;
    case 'step': {
      const input = document.getElementById(`in-${el.dataset.name}`);
      input.value = Math.max(0, +(Number(input.value || 0) + Number(el.dataset.delta)).toFixed(2));
      break;
    }
    case 'pick-rpe':
      document.getElementById('in-rpe').value = el.dataset.val;
      el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el));
      document.getElementById('rpe-desc').textContent = E.RPE_LABELS[el.dataset.val] || '';
      break;
    case 'log-set':
      logSet(i, j);
      break;
    case 'swap': {
      const { session, log } = state.active;
      const swapped = E.swapAccessory(state, session, i);
      if (!swapped) { toast('No other option in this group today.'); break; }
      session.exercises[i] = swapped;
      log.exercises[i] = { sets: swapped.sets.map(() => null) };
      if (ui.editing?.ex === i) ui.editing = { ex: i, set: 0 };
      persist();
      render();
      break;
    }
    case 'clear-set':
      state.active.log.exercises[i].sets[j] = null;
      persist();
      render();
      break;
    case 'rest-add':
      if (ui.rest) ui.rest.end += 30000;
      tick();
      break;
    case 'rest-dismiss':
      ui.rest = null;
      tick();
      break;
    case 'finish': {
      const { session, log } = state.active;
      if (session.kind === 'lift') {
        const left = session.exercises.reduce((n, ex, x) => n + ex.sets.filter((s, y) => !log.exercises[x].sets[y] && !s.optional).length, 0);
        if (left && !confirm(`${left} set${left > 1 ? 's' : ''} not logged. Finish anyway?`)) return;
      }
      finishSession(false);
      break;
    }
    case 'cardio-rpe':
      state.active.log.rpe = Number(el.dataset.val);
      state.active.log.completed = document.getElementById('c-done').checked;
      state.active.log.minutes = document.getElementById('c-min').value;
      state.active.log.avgHr = document.getElementById('c-hr').value;
      persist();
      render();
      break;
    case 'timer-toggle': {
      beep(440, 1); // unlock audio on user gesture
      let t = ui.cardioTimer;
      if (!t) {
        const phases = cardioPhases(state.active.session);
        t = ui.cardioTimer = { phases, total: phases.reduce((s, p) => s + p.sec, 0), elapsed: 0, running: false, lastIdx: null };
      }
      if (t.running) {
        t.elapsed += (Date.now() - t.startedAt) / 1000;
        t.running = false;
        keepAwake(false);
      } else if (t.elapsed < t.total) {
        t.startedAt = Date.now();
        t.running = true;
        keepAwake(true);
      }
      render();
      break;
    }
    case 'timer-reset':
      ui.cardioTimer = null;
      keepAwake(false);
      render();
      break;
    case 'export':
      exportFile(state);
      break;
    case 'reset':
      if (confirm('Erase all training data on this device? Export a backup first if you want to keep it.')) {
        state = null;
        save(null);
        ui.summary = null;
        render();
      }
      break;
    default:
  }
});

$app.addEventListener('change', async (e) => {
  if (e.target.dataset.action !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = E.migrateState(await importFile(file));
    if (state && !confirm('Replace your current data with this backup?')) return;
    tab = 'today';
    commit(data);
    toast('Backup restored.');
  } catch (err) {
    toast(err.message || 'Could not read that file.');
  }
});

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (e.target.id === 'setup') {
    const profile = {
      ...E.defaultProfile(),
      units: f.get('units'),
      age: Number(f.get('age')),
      liftDays: Number(f.get('liftDays')),
      cardioDays: Number(f.get('cardioDays')),
      length: f.get('length'),
      finisher: Number(f.get('finisher')),
      z2Start: Math.max(10, Number(f.get('z2Start')) || 20),
      caps: readCaps(f),
    };
    profile.z2Max = Math.max(profile.z2Max, profile.z2Start);
    const inputs = {};
    for (const k of Object.keys(E.MAIN_LIFTS)) {
      inputs[k] = { weight: Number(f.get(`${k}-w`)), reps: Number(f.get(`${k}-r`)), rpe: Number(f.get(`${k}-rpe`)) };
    }
    tab = 'today';
    commit(E.createState(profile, inputs));
  } else if (e.target.id === 'settings') {
    const next = E.applyProfileChange(state, {
      units: f.get('units'),
      age: Number(f.get('age')),
      liftDays: Number(f.get('liftDays')),
      cardioDays: Number(f.get('cardioDays')),
      length: f.get('length'),
      finisher: Number(f.get('finisher')),
      z2Max: Math.max(15, Number(f.get('z2Max')) || 60),
    });
    commit(next);
    toast('Settings saved.');
  } else if (e.target.id === 'caps') {
    commit(E.applyProfileChange(state, { caps: readCaps(f) }));
    toast('Weight limits saved.');
  } else if (e.target.id === 'maxes') {
    const next = structuredClone(state);
    for (const k of Object.keys(E.MAIN_LIFTS)) {
      const v = Number(f.get(k));
      if (v > 0 && Math.abs(v - fmtE1(state.lifts[k].e1rm)) > 0.01) {
        next.lifts[k].e1rm = v;
        next.lifts[k].strikes = 0;
        next.lifts[k].history.push({ date: new Date().toISOString(), e1rm: v });
      }
    }
    commit(next);
    toast('Maxes updated.');
  }
});

$nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  ui.summary = tab === 'today' ? ui.summary : null;
  render();
  window.scrollTo(0, 0);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
