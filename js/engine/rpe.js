// RPE / reps-in-reserve math.
//
// Percent of 1RM indexed by "effective reps" = reps performed + reps left in
// reserve (10 - RPE). This is the widely used RTS-style chart: 5 reps @ RPE 8
// is ~7 effective reps, so ~81% of 1RM.
const PCT_BY_EFFECTIVE_REPS = [
  1.0, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786,
  0.762, 0.739, 0.707, 0.68, 0.653, 0.626, 0.6, 0.575,
];

export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export const RPE_LABELS = {
  6: '4+ reps left',
  6.5: '3-4 reps left',
  7: '3 reps left',
  7.5: '2-3 reps left',
  8: '2 reps left',
  8.5: '1-2 reps left',
  9: '1 rep left',
  9.5: 'maybe 1 left',
  10: 'nothing left',
};

export function percentOf1RM(reps, rpe) {
  const eff = Math.max(1, reps + (10 - rpe));
  const n = PCT_BY_EFFECTIVE_REPS.length;
  if (eff >= n) {
    return Math.max(0.4, PCT_BY_EFFECTIVE_REPS[n - 1] - (eff - n) * 0.025);
  }
  const lo = Math.floor(eff);
  const hi = Math.ceil(eff);
  const a = PCT_BY_EFFECTIVE_REPS[lo - 1];
  const b = PCT_BY_EFFECTIVE_REPS[hi - 1];
  return a + (b - a) * (eff - lo);
}

// Estimated 1RM from a single set. A set where no reps were completed tells
// us the 1RM is below that weight, so we estimate just under it.
export function estimate1RM(weight, reps, rpe) {
  if (!(weight > 0)) return 0;
  if (!(reps > 0)) return weight * 0.95;
  const r = rpe == null ? 9 : Math.min(10, Math.max(5, rpe));
  return weight / percentOf1RM(reps, r);
}

export function loadFor(e1rm, reps, rpe) {
  return e1rm * percentOf1RM(reps, rpe);
}
