# Steady Strong

A short, simple training app built on squat, bench and deadlift, with cardio that
progresses the same way the lifts do. It aims for a strong body, a healthy heart
and a long life, not a meet total.

- **Short sessions:** about 45 minutes, or about 30 in "short" mode.
- **Thinks ahead:** the Plan tab projects your next two weeks of weights and cardio.
- **Autoregulated:** you rate each set by RPE. The app adjusts the rest of today's
  session and all future sessions from those ratings.
- **Private and offline:** no account and no server. Data stays on your phone. You
  can export a backup file.

## How the training works

| Piece | What it does |
| --- | --- |
| **4-week blocks** | 3 weeks that get heavier, then 1 lighter deload week. Blocks alternate between **Build** (10→9→8 reps) and **Strength** (6→5→4 reps). |
| **Weight limits** | Set the heaviest you want to lift for each lift (defaults: squat 315, bench 225, deadlift 405, press 135 lb). At a limit, the weight holds and the target reps climb instead, up to 12 (10 for deadlifts). Rep records at each limit are tracked. |
| **Main lift** | One top set at a target RPE (never above 8.5), then 1-2 back-off sets about 1 RPE lighter. Includes an automatic warm-up ramp. |
| **Volume lift** | Easy sets (RPE 6.5) of a second big lift for practice. |
| **Accessories** | 2-3 movements per session from groups like rows, pull-ups, single-leg work, hinges, upper back, pressing, arms and grip. The exercise in each group rotates every 4-week block, and **Swap** picks another one for today. No direct core work, because heavy squats and deadlifts cover it. They use double progression: hit the top of the rep range on every set and the weight goes up. Weights are remembered for when an exercise rotates back. |
| **Cardio finisher** | Optional 10-20 min of easy cardio at the end of each lifting day. When it's on, accessory and volume sets drop to 2 so the session stays around 45-50 minutes. |
| **Zone 2 cardio** | Easy, conversational work, 0-5 days a week. It grows 5 minutes per session you complete easily, up to your cap (60 min by default). |
| **Interval cardio** | Climbs a ladder from 5 × 1 min up to the 4×4 protocol (4 min hard, 3 min easy), then holds there. |

### Adjusting to you

- **During a session:** if the top set is harder than planned or you miss reps, the
  back-off weights drop right away. If it was easy, they go up a little (capped).
  Two grinding sets in a row and the app tells you to stop that lift for the day.
- **Between sessions:** your estimated max for each lift is recalculated from what
  you logged. Hit your targets and it goes up at least 1%, which is the progressive
  overload. Miss them and it eases back. Two rough sessions in a row on the same
  lift triggers a 5% reset so you can rebuild momentum.
- **Readiness check-in:** poor sleep, low energy or soreness gives you an easier day
  (lower RPE targets and fewer sets). After a 2-week break, the first session back
  is eased automatically.
- **Cardio:** if a Zone 2 session was too hard (effort 7+ or heart rate above zone)
  its duration holds and you get a cue to slow down. If intervals were too much,
  they step back down the ladder.
- **Deload weeks** swap intervals for easy Zone 2.

Heart-rate zones come from your age (Tanaka: 208 − 0.7 × age). Zone 2 is 60-70% of
max and interval efforts are 85-95%.

## Using it

Any static web host works because there is no build step.

```bash
npm start           # serves at http://localhost:8080
npm test            # runs the training-engine tests (Node 20+)
```

To put it on your phone: host the folder (for example, turn on GitHub Pages for the
repo), open the URL on your phone, then choose **Add to Home Screen**. After that it
works offline like a native app.

## Code layout

```
index.html, css/, icons/, manifest.webmanifest, sw.js   app shell and PWA/offline
js/app.js            UI: screens, set logging, rest and interval timers
js/storage.js        localStorage persistence, backup export and import
js/engine/           pure training logic, no DOM
  rpe.js             RPE chart, e1RM estimates
  loads.js           plate rounding, warm-ups
  library.js         exercises, blocks, day templates
  cardio.js          HR zones, Zone 2 and interval progression
  program.js         session building, live adjustment, progression, projection
test/engine.test.js
```

*General fitness guidance, not medical advice. Check with a doctor before starting
hard exercise if you have heart, blood-pressure or joint concerns.*
