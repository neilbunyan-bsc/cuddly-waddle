// Exercises, training blocks, and day templates.

export const MAIN_LIFTS = {
  squat: { name: 'Back Squat' },
  bench: { name: 'Bench Press' },
  deadlift: { name: 'Deadlift' },
  press: { name: 'Overhead Press' },
};

// Accessories use double progression: reach the top of the rep range on every
// set and the weight goes up. `loaded: false` means bodyweight, so the rep
// target climbs instead. Ids are stable so progress survives rotations.
export const ACCESSORIES = {
  // Horizontal pull
  row: { name: 'One-Arm Dumbbell Row', range: [8, 12], loaded: true, start: { lb: 40, kg: 18 }, note: 'Per arm' },
  chestRow: { name: 'Chest-Supported Row', range: [8, 12], loaded: true, start: { lb: 30, kg: 14 }, note: 'Dumbbells on an incline bench, weight per hand' },
  cableRow: { name: 'Seated Cable Row', range: [10, 15], loaded: true, start: { lb: 90, kg: 40 } },
  // Vertical pull
  pullup: { name: 'Pull-up', range: [5, 12], loaded: true, start: { lb: 0, kg: 0 }, note: '0 = bodyweight. Use a band or the pulldown if you can\'t get 5.' },
  chinup: { name: 'Chin-up', range: [5, 12], loaded: true, start: { lb: 0, kg: 0 }, note: '0 = bodyweight. Palms facing you.' },
  pulldown: { name: 'Lat Pulldown', range: [8, 12], loaded: true, start: { lb: 100, kg: 45 } },
  // Single leg
  splitSquat: { name: 'Split Squat', range: [8, 12], loaded: true, start: { lb: 20, kg: 8 }, note: 'Per leg, dumbbell weight per hand' },
  reverseLunge: { name: 'Reverse Lunge', range: [8, 12], loaded: true, start: { lb: 20, kg: 8 }, note: 'Per leg, dumbbell weight per hand' },
  stepUp: { name: 'Step-up', range: [8, 12], loaded: true, start: { lb: 20, kg: 8 }, note: 'Knee-height box, per leg, weight per hand' },
  // Hinge
  rdl: { name: 'Romanian Deadlift', range: [8, 10], loaded: true, start: { lb: 135, kg: 60 } },
  hipThrust: { name: 'Barbell Hip Thrust', range: [8, 12], loaded: true, start: { lb: 135, kg: 60 } },
  backExt: { name: 'Back Extension', range: [10, 15], loaded: true, start: { lb: 0, kg: 0 }, note: '0 = bodyweight. Hold a plate to add weight.' },
  // Squat pattern
  gobletSquat: { name: 'Goblet Squat', range: [8, 12], loaded: true, start: { lb: 50, kg: 22 } },
  legPress: { name: 'Leg Press', range: [10, 15], loaded: true, start: { lb: 180, kg: 80 } },
  // Upper back / shoulder health
  facePull: { name: 'Face Pull', range: [12, 20], loaded: true, start: { lb: 30, kg: 12 } },
  rearDelt: { name: 'Rear Delt Fly', range: [12, 20], loaded: true, start: { lb: 10, kg: 4 }, note: 'Weight per hand' },
  pullApart: { name: 'Band Pull-Apart', range: [15, 30], loaded: false, step: 2 },
  // Pressing assistance
  dbBench: { name: 'Dumbbell Bench Press', range: [8, 12], loaded: true, start: { lb: 50, kg: 22 }, note: 'Weight per hand' },
  inclineDb: { name: 'Incline Dumbbell Press', range: [8, 12], loaded: true, start: { lb: 40, kg: 18 }, note: 'Weight per hand' },
  dip: { name: 'Dip', range: [6, 15], loaded: true, start: { lb: 0, kg: 0 }, note: '0 = bodyweight' },
  pushup: { name: 'Push-up', range: [10, 30], loaded: false, step: 2 },
  // Arms
  curl: { name: 'Dumbbell Curl', range: [10, 15], loaded: true, start: { lb: 20, kg: 8 }, note: 'Weight per hand' },
  hammerCurl: { name: 'Hammer Curl', range: [10, 15], loaded: true, start: { lb: 25, kg: 10 }, note: 'Weight per hand' },
  pushdown: { name: 'Triceps Pushdown', range: [10, 15], loaded: true, start: { lb: 40, kg: 18 } },
  ohTriceps: { name: 'Overhead Triceps Extension', range: [10, 15], loaded: true, start: { lb: 30, kg: 12 }, note: 'One dumbbell, both hands' },
  // Grip
  carry: { name: "Farmer's Carry", range: [30, 45], unit: 'sec', loaded: true, start: { lb: 50, kg: 22 }, note: 'Weight per hand' },
  shrug: { name: 'Dumbbell Shrug', range: [10, 15], loaded: true, start: { lb: 50, kg: 22 }, note: 'Weight per hand' },
};

// Accessory slots in templates name a category. Each 4-week block picks a
// different exercise from the category so things stay fresh while each
// exercise still gets a full block to progress.
export const ACCESSORY_POOLS = {
  hRow: ['row', 'chestRow', 'cableRow'],
  vPull: ['pullup', 'pulldown', 'chinup'],
  singleLeg: ['splitSquat', 'reverseLunge', 'stepUp'],
  hinge: ['rdl', 'hipThrust', 'backExt'],
  squatPattern: ['gobletSquat', 'legPress'],
  upperBack: ['facePull', 'rearDelt', 'pullApart'],
  push: ['dbBench', 'inclineDb', 'dip', 'pushup'],
  arms: ['curl', 'pushdown', 'hammerCurl', 'ohTriceps'],
  grip: ['carry', 'shrug'],
};

export function accessoryCategory(id) {
  return Object.keys(ACCESSORY_POOLS).find((c) => ACCESSORY_POOLS[c].includes(id));
}

// Which exercise fills a category slot. Offsetting by day keeps two days that
// share a category from doing the identical exercise in the same block.
export function pickAccessory(category, blockIndex, dayIndex) {
  const pool = ACCESSORY_POOLS[category];
  return pool[(blockIndex + dayIndex) % pool.length];
}

// Main-lift waves. Top sets never go past RPE 8.5: hard enough to drive
// progress, far enough from failure to recover and stay healthy.
export const BLOCKS = {
  build: {
    name: 'Build',
    focus: 'Moderate weights, sets of 8-10. Builds muscle and work capacity.',
    weeks: [
      { reps: 10, rpe: 7 },
      { reps: 9, rpe: 7.5 },
      { reps: 8, rpe: 8 },
    ],
    secondary: { reps: 10, rpe: 6.5 },
  },
  strength: {
    name: 'Strength',
    focus: 'Heavier sets of 4-6. At your weight caps, this is where the extra reps come from.',
    weeks: [
      { reps: 6, rpe: 7.5 },
      { reps: 5, rpe: 8 },
      { reps: 4, rpe: 8.5 },
    ],
    secondary: { reps: 6, rpe: 6.5 },
  },
};

export const BLOCK_ORDER = ['build', 'strength'];
export const WEEKS_PER_BLOCK = 4; // 3 progressive weeks + 1 deload
// Deload: noticeably lighter and about half the sets.
// Main lift deload: sets of 5 at 85% of week 3's weight (well under RPE 6).
export const DELOAD = { reps: 5, rpe: 5, scale: 0.85 };
export const DELOAD_SECONDARY = { reps: 8, rpe: 4.5 };

// Lifting day templates keyed by days per week. Accessories are categories
// (see ACCESSORY_POOLS) in priority order; short sessions keep the first two.
// No direct core work: heavy squats and deadlifts cover it.
export const TEMPLATES = {
  2: [
    { key: 'A', title: 'Squat + Bench', main: 'squat', secondary: 'bench', accessories: ['hRow', 'singleLeg', 'arms'] },
    { key: 'B', title: 'Deadlift + Press', main: 'deadlift', secondary: 'press', accessories: ['vPull', 'upperBack', 'push'] },
  ],
  3: [
    { key: 'A', title: 'Squat Day', main: 'squat', secondary: 'press', accessories: ['hRow', 'upperBack', 'arms'] },
    { key: 'B', title: 'Bench Day', main: 'bench', accessories: ['vPull', 'singleLeg', 'hinge'] },
    { key: 'C', title: 'Deadlift Day', main: 'deadlift', secondary: 'bench', accessories: ['hRow', 'grip', 'arms'] },
  ],
  4: [
    { key: 'A', title: 'Squat Day', main: 'squat', accessories: ['hRow', 'hinge', 'arms'] },
    { key: 'B', title: 'Bench Day', main: 'bench', accessories: ['vPull', 'upperBack', 'arms'] },
    { key: 'C', title: 'Deadlift Day', main: 'deadlift', accessories: ['vPull', 'singleLeg', 'grip'] },
    { key: 'D', title: 'Press Day', main: 'press', secondary: 'bench', accessories: ['hRow', 'squatPattern', 'upperBack'] },
  ],
};

export function blockTypeFor(blockIndex) {
  return BLOCK_ORDER[blockIndex % BLOCK_ORDER.length];
}
