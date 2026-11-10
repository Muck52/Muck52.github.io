# Cat project, study 01: the base model

A procedural, anatomically grounded cat that will later live in an interactive environment.
No build step and no dependencies: plain ES modules.

- **`index.html`**: Cat Lab. Drive the model (walk, trot, gallop, sit, crouch, stretch, stalk,
  pounce, jump). It can show the skeleton, joint angles, a live footfall diagram and a trackway.
  The cat watches your pointer.
- **`study.html`**: the written study: dimensions and their sources, skeleton, the pantograph-limb
  IK, gait science (Froude scaling, duty factor, coupled oscillators), the hunting sequence,
  validation results and open questions. Its tables are computed live from the model.
- **`tests/check.mjs`**: a headless validation suite (`npm run check`, needs Node ≥ 18).

| file | role |
| --- | --- |
| `js/anatomy.js` | bone lengths, vertebral counts, soft-tissue envelope |
| `js/motion.js` | gait templates, posture presets, stride law constants |
| `js/ik.js` | exact three-segment "pantograph" limb solver |
| `js/cat.js` | the `Cat` controller: gait engine, planted feet, body, head, tail, jump/pounce |
| `js/render.js` | skin and skeleton drawing (reads the rig only) |
| `js/measure.js` | headless measurement shared by the tests and the study page |
| `js/lab.js` | the lab UI |

Run locally with any static server from the repo root, e.g. `python3 -m http.server`, then open
`/cat/`. ES modules don't load from `file://`.

## Using the cat from an environment

```js
import { Cat } from './js/cat.js';
import { drawCat } from './js/render.js';
const cat = new Cat({ x: 0 });
cat.setSpeed(60);            // cm/s; gait chosen automatically
cat.setLook({ x: 80, y: 5 });
cat.pounce(120);             // stalk-crouch-tread-leap-pin toward world x = 120
cat.update(1 / 120);         // fixed steps
drawCat(ctx, cat, { coat: 'tabby' }); // ctx mapped to world cm, y up
```
