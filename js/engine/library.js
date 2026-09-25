// Exercises, training blocks, and day templates.

export const MAIN_LIFTS = {
  squat: { name: 'Back Squat' },
  bench: { name: 'Bench Press' },
  deadlift: { name: 'Deadlift' },
  press: { name: 'Overhead Press' },
};

// Accessories use double progression. `loaded: false` means bodyweight/time:
// the rep (or second) target climbs instead of the weight.
export const ACCESSORIES = {
  row: { name: 'One-Arm Dumbbell Row', range: [8, 12], loaded: true, start: { lb: 40, kg: 18 }, note: 'Per arm' },
  pullup: { name: 'Pull-up or Lat Pulldown', range: [6, 12], loaded: true, start: { lb: 0, kg: 0 }, note: '0 = bodyweight pull-ups' },
  rdl: { name: 'Romanian Deadlift', range: [8, 10], loaded: true, start: { lb: 95, kg: 40 } },
  splitSquat: { name: 'Split Squat (dumbbells)', range: [8, 12], loaded: true, start: { lb: 20, kg: 8 }, note: 'Per leg, weight per hand' },
  gobletSquat: { name: 'Goblet Squat', range: [8, 12], loaded: true, start: { lb: 35, kg: 16 } },
  facePull: { name: 'Face Pull / Band Pull-Apart', range: [12, 20], loaded: true, start: { lb: 30, kg: 12 } },
  carry: { name: "Farmer's Carry", range: [30, 45], unit: 'sec', loaded: true, start: { lb: 50, kg: 22 }, note: 'Weight per hand' },
  plank: { name: 'Plank', range: [30, 60], unit: 'sec', loaded: false, step: 5 },
  deadBug: { name: 'Dead Bug', range: [6, 12], loaded: false, step: 1, note: 'Per side, slow' },
  pushup: { name: 'Push-up', range: [8, 25], loaded: false, step: 1 },
};

// Main-lift waves. Top sets never go past RPE 8.5: hard enough to drive
// progress, far enough from failure to recover and stay healthy.
export const BLOCKS = {
  build: {
    name: 'Build',
    focus: 'Moderate weights, more reps. Builds muscle and work capacity.',
    weeks: [
      { reps: 8, rpe: 7 },
      { reps: 7, rpe: 7.5 },
      { reps: 6, rpe: 8 },
    ],
    secondary: { reps: 8, rpe: 6.5 },
  },
  strength: {
    name: 'Strength',
    focus: 'Heavier weights, fewer reps. Turns new muscle into strength.',
    weeks: [
      { reps: 5, rpe: 7.5 },
      { reps: 4, rpe: 8 },
      { reps: 3, rpe: 8.5 },
    ],
    secondary: { reps: 6, rpe: 6.5 },
  },
};

export const BLOCK_ORDER = ['build', 'strength'];
export const WEEKS_PER_BLOCK = 4; // 3 progressive weeks + 1 deload
// Deload: noticeably lighter and about half the sets.
export const DELOAD = { reps: 5, rpe: 5 };
export const DELOAD_SECONDARY = { reps: 6, rpe: 5 };

// Lifting day templates keyed by days per week. Accessories are listed in
// priority order; short sessions keep only the first two.
export const TEMPLATES = {
  2: [
    { key: 'A', title: 'Squat + Bench', main: 'squat', secondary: 'bench', accessories: ['row', 'plank', 'splitSquat'] },
    { key: 'B', title: 'Bench + Deadlift', main: 'bench', secondary: 'deadlift', accessories: ['pullup', 'carry', 'facePull'] },
  ],
  3: [
    { key: 'A', title: 'Squat Day', main: 'squat', secondary: 'press', accessories: ['row', 'plank', 'facePull'] },
    { key: 'B', title: 'Bench Day', main: 'bench', accessories: ['rdl', 'pullup', 'splitSquat'] },
    { key: 'C', title: 'Deadlift Day', main: 'deadlift', secondary: 'bench', accessories: ['carry', 'deadBug', 'pullup'] },
  ],
  4: [
    { key: 'A', title: 'Squat Day', main: 'squat', accessories: ['row', 'plank', 'splitSquat'] },
    { key: 'B', title: 'Bench Day', main: 'bench', accessories: ['pullup', 'facePull', 'pushup'] },
    { key: 'C', title: 'Deadlift Day', main: 'deadlift', accessories: ['gobletSquat', 'carry', 'deadBug'] },
    { key: 'D', title: 'Press Day', main: 'press', secondary: 'bench', accessories: ['row', 'splitSquat', 'plank'] },
  ],
};

export function blockTypeFor(blockIndex) {
  return BLOCK_ORDER[blockIndex % BLOCK_ORDER.length];
}
