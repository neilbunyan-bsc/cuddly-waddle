// Load rounding and warm-up generation.

export const UNIT_CONFIG = {
  lb: { bar: 45, step: 5, accessoryStep: 5 },
  kg: { bar: 20, step: 2.5, accessoryStep: 2.5 },
};

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

export function roundBarbell(weight, units) {
  const { bar, step } = UNIT_CONFIG[units];
  return Math.max(bar, roundTo(weight, step));
}

// A short ramp to the top set. Fewer steps for lighter tops so warm-ups
// don't eat the session.
export function warmupSets(topWeight, units) {
  const { bar } = UNIT_CONFIG[units];
  const ramp = [
    { pct: 0.4, reps: 5 },
    { pct: 0.6, reps: 3 },
    { pct: 0.75, reps: 2 },
    { pct: 0.87, reps: 1 },
  ];
  const sets = [{ weight: bar, reps: 8 }];
  for (const r of ramp) {
    const w = roundBarbell(topWeight * r.pct, units);
    const last = sets[sets.length - 1].weight;
    if (w > last && w < topWeight) sets.push({ weight: w, reps: r.reps });
  }
  return sets;
}
