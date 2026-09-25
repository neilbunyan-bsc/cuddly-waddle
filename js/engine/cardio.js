// Cardio prescription and progression.
//
// Two kinds of session, both progressed the same way the lifts are: do the
// work at the target effort and it grows next time; struggle and it holds or
// steps back.
//  - Zone 2: easy, conversational. Duration climbs 5 min at a time to a cap.
//  - Intervals: a ladder that tops out at the classic 4x4 (4 min hard, 3 min
//    easy), the best-studied protocol for raising VO2 max.

export const INTERVAL_LADDER = [
  { reps: 5, work: 60, rest: 90 },
  { reps: 6, work: 60, rest: 90 },
  { reps: 8, work: 60, rest: 60 },
  { reps: 3, work: 180, rest: 120 },
  { reps: 4, work: 180, rest: 120 },
  { reps: 3, work: 240, rest: 180 },
  { reps: 4, work: 240, rest: 180 },
];

export const WARMUP_MIN = 5;
export const COOLDOWN_MIN = 5;
export const Z2_STEP = 5;

export function heartRateZones(age) {
  const max = Math.round(208 - 0.7 * age); // Tanaka formula
  return {
    max,
    z2: [Math.round(max * 0.6), Math.round(max * 0.7)],
    hard: [Math.round(max * 0.85), Math.round(max * 0.95)],
  };
}

function fmtSec(s) {
  return s % 60 === 0 ? `${s / 60} min` : `${s}s`;
}

export function intervalLabel(rung) {
  return `${rung.reps} × ${fmtSec(rung.work)} hard / ${fmtSec(rung.rest)} easy`;
}

export function intervalMinutes(rung) {
  const main = (rung.reps * rung.work + (rung.reps - 1) * rung.rest) / 60;
  return Math.round(WARMUP_MIN + main + COOLDOWN_MIN);
}

export function buildCardioSession(kind, cardio, profile, { deload = false, lowReadiness = false } = {}) {
  const zones = heartRateZones(profile.age);
  // Deload weeks and rough days turn intervals into easy Zone 2.
  if (kind === 'intervals' && !deload && !lowReadiness) {
    const rung = INTERVAL_LADDER[cardio.intervalRung];
    return {
      kind: 'cardio',
      cardioType: 'intervals',
      title: 'Intervals',
      rung: cardio.intervalRung,
      intervals: { ...rung, warmup: WARMUP_MIN, cooldown: COOLDOWN_MIN },
      minutes: intervalMinutes(rung),
      targetRpe: 8,
      hr: zones.hard,
      description: `${WARMUP_MIN} min easy, ${intervalLabel(rung)}, ${COOLDOWN_MIN} min easy.`,
      cue: `Hard efforts at ${zones.hard[0]}-${zones.hard[1]} bpm (roughly 8/10). You should be able to finish every rep at the same pace.`,
    };
  }
  let minutes = cardio.z2Minutes;
  if (deload || lowReadiness) minutes = Math.max(15, Math.round((minutes * 0.7) / 5) * 5);
  const easyReason = kind === 'intervals' ? (deload ? ' (deload week: intervals swapped for easy work)' : ' (low readiness: intervals swapped for easy work)') : '';
  return {
    kind: 'cardio',
    cardioType: 'z2',
    title: 'Zone 2',
    minutes,
    targetRpe: 4,
    hr: zones.z2,
    description: `${minutes} min steady and easy${easyReason}.`,
    cue: `Stay at ${zones.z2[0]}-${zones.z2[1]} bpm. You should be able to talk in full sentences. Slow down if you can't.`,
  };
}

// Returns the updated cardio state and a note explaining the decision.
export function progressCardio(cardio, session, log, profile) {
  const next = { ...cardio };
  const rpe = Number(log.rpe);
  const avgHr = Number(log.avgHr) || null;
  const completed = log.completed !== false;

  if (session.cardioType === 'z2') {
    // Deload/easy-day sessions are deliberately short; don't progress off them.
    if (session.minutes < cardio.z2Minutes) {
      return { cardio: next, note: 'Easy session logged. Zone 2 duration unchanged.' };
    }
    const tooHard = rpe >= 7 || (avgHr && avgHr > session.hr[1] + 3);
    if (!completed) {
      next.z2Minutes = Math.max(profile.z2Start ?? 20, cardio.z2Minutes - Z2_STEP);
      return { cardio: next, note: `Session cut short. Zone 2 steps back to ${next.z2Minutes} min.` };
    }
    if (tooHard) {
      return { cardio: next, note: `That was harder than Zone 2 should feel. Holding ${cardio.z2Minutes} min; go slower next time so heart rate stays under ${session.hr[1]} bpm.` };
    }
    if (cardio.z2Minutes >= profile.z2Max) {
      return { cardio: next, note: `At your ${profile.z2Max} min cap. Keep it steady here; fitness will show as a faster pace at the same heart rate.` };
    }
    next.z2Minutes = Math.min(profile.z2Max, cardio.z2Minutes + Z2_STEP);
    return { cardio: next, note: `Good easy session. Zone 2 goes up to ${next.z2Minutes} min.` };
  }

  const top = INTERVAL_LADDER.length - 1;
  if (!completed || rpe >= 10) {
    next.intervalRung = Math.max(0, cardio.intervalRung - 1);
    return { cardio: next, note: `Intervals were too much. Stepping back to ${intervalLabel(INTERVAL_LADDER[next.intervalRung])}.` };
  }
  if (rpe >= 9) {
    return { cardio: next, note: 'Tough but done. Repeating the same intervals next time.' };
  }
  if (cardio.intervalRung >= top) {
    return { cardio: next, note: "You're at the top of the ladder (4×4). Keep it here and push a bit more pace on the hard minutes." };
  }
  next.intervalRung = cardio.intervalRung + 1;
  return { cardio: next, note: `Solid. Next intervals: ${intervalLabel(INTERVAL_LADDER[next.intervalRung])}.` };
}
