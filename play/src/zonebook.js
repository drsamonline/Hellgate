// ---------------------------------------------------------------------------
// ZONE BOOK — the story as decisions, not panels.
//
// Each zone ends with a passage and two choices. The choice sets a flag, and the
// flags are read by the game: `mercy` gives you health, `greed` gives you loot and
// score, `haste` gives you speed, `careful` gives you armour. Two runs with the
// same seed and different choices are different runs.
//
// The engine is `book.js`; this file is only data. A node is one zone, and its
// choices lead to the next zone's node, so the trail is the campaign.
// ---------------------------------------------------------------------------

/**
 * The campaign as a book: one passage per zone, two choices at each, and two
 * endings at the throne. Every choice writes a flag the game reads.
 */
export const ZONE_BOOK = {
  id: 'hellgate-campaign',
  vars: { mercy: 0, greed: 0, haste: 0, careful: 0, zones: 0 },
  start: 'gate',
  nodes: {
    gate: {
      title: 'THE GATE',
      text: 'The gate is shut and the body in front of it is not the first. There is a gap at the hinge, and a lever that would open it for whatever is behind you.',
      choices: [
        {
          label: 'Squeeze through the gap',
          to: 'foundry',
          effects: [{ op: 'add', var: 'haste', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Pull the lever and let them follow',
          to: 'foundry',
          effects: [{ op: 'add', var: 'mercy', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    foundry: {
      title: 'THE FOUNDRY',
      text: 'The belt still turns. There is a cart of tools beside it, and a chute that goes down.',
      choices: [
        {
          label: 'Take the tools',
          to: 'grove',
          effects: [{ op: 'add', var: 'careful', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Take the cart',
          to: 'grove',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    grove: {
      title: 'THE GROVE',
      text: 'Something is growing where the water is. It has been left alone for a long time, and it has used that time.',
      choices: [
        {
          label: 'Burn it back',
          to: 'vault',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Walk around it',
          to: 'vault',
          effects: [{ op: 'add', var: 'haste', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    vault: {
      title: 'THE VAULT',
      text: 'Every door here is a drawer and every drawer is full. The manifest says the contents were sealed for a reason.',
      choices: [
        {
          label: 'Take what the manifest lists',
          to: 'ashfall',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Leave the drawers shut',
          to: 'ashfall',
          effects: [{ op: 'add', var: 'careful', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    ashfall: {
      title: 'ASHFALL',
      text: 'The ash is knee-deep and warm. Something under it is still burning, and it is not a fire.',
      choices: [
        {
          label: 'Dig it out',
          to: 'cistern',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Mark the spot and move',
          to: 'cistern',
          effects: [{ op: 'add', var: 'careful', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    cistern: {
      title: 'THE CISTERN',
      text: 'The water is over your boots and rising. There is a valve, and there is a ladder.',
      choices: [
        {
          label: 'Turn the valve',
          to: 'spine',
          effects: [{ op: 'add', var: 'mercy', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Climb the ladder',
          to: 'spine',
          effects: [{ op: 'add', var: 'haste', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    spine: {
      title: 'THE SPINE',
      text: 'The corridor narrows until your shoulders touch both walls. Something ahead is breathing in time with the pipe.',
      choices: [
        {
          label: 'Keep going',
          to: 'kiln',
          effects: [{ op: 'add', var: 'haste', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Back out and find another way',
          to: 'kiln',
          effects: [{ op: 'add', var: 'careful', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    kiln: {
      title: 'THE KILN',
      text: 'The fire has not been fed in seven hundred years and it is still going. There is a door at the back and a hatch above it.',
      choices: [
        {
          label: 'Go through the door',
          to: 'throne',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Take the hatch',
          to: 'throne',
          effects: [{ op: 'add', var: 'careful', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    throne: {
      title: 'THE THRONE',
      text: 'The warden is dead and the chair is empty. There is a lever beside it, and there is the way you came in.',
      choices: [
        {
          label: 'Sit down',
          to: 'end-seated',
          effects: [{ op: 'add', var: 'greed', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
        {
          label: 'Pull the lever and leave',
          to: 'end-left',
          effects: [{ op: 'add', var: 'mercy', value: 1 }, { op: 'add', var: 'zones', value: 1 }],
        },
      ],
    },
    'end-seated': {
      title: 'SEATED',
      text: 'The chair is warm. It was always going to be warm.',
      ending: true,
      endingTitle: 'The gate keeps itself',
    },
    'end-left': {
      title: 'LEFT',
      text: 'The lever moves and the gate opens behind you, on a corridor you have already walked.',
      ending: true,
      endingTitle: 'The gate is a gate',
    },
  },
};

/**
 * The effects a run should feel. One line each, so the mechanic and the story
 * stay in the same place.
 */
export const FLAG_EFFECTS = {
  mercy: (n) => ({ maxHp: 12 * n, blurb: '+12 max health per kind choice' }),
  greed: (n) => ({ scoreMul: 1 + 0.2 * n, pickups: 2 * n, blurb: '+20% score and two more pickups per greedy choice' }),
  haste: (n) => ({ speedMul: 1 + 0.05 * n, blurb: '+5% speed per hurried choice' }),
  careful: (n) => ({ armour: 8 * n, blurb: '+8 armour at the start of each zone per cautious choice' }),
};

/** Turn a flags object into the numbers the game reads. */
export function effectsFor(flags) {
  const out = { maxHp: 0, scoreMul: 1, pickups: 0, speedMul: 1, armour: 0 };
  for (const key of Object.keys(FLAG_EFFECTS)) {
    const n = (flags && flags[key]) || 0;
    if (!n) continue;
    const e = FLAG_EFFECTS[key](n);
    out.maxHp += e.maxHp || 0;
    out.pickups += e.pickups || 0;
    out.armour += e.armour || 0;
    out.scoreMul *= e.scoreMul || 1;
    out.speedMul *= e.speedMul || 1;
  }
  return out;
}
