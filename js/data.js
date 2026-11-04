// Sleep On It — game data and tunables.
// This file is the data contract for every other module. Classic script, no modules: everything hangs off window.SOI.
// Units: meters. Y is up. The street runs east (+X) to west (-X). North is -Z.
window.SOI = window.SOI || {};

SOI.data = {
  // World bounds and the discovery grid (implementation plan 3.3: 2 m cells).
  world: { minX: -70, maxX: 90, minZ: -50, maxZ: 50, cell: 2 },

  tunables: {
    // Time (3.2). Game minutes per real second. The day starts after school.
    dayStartMinutes: 15 * 60 + 30,     // 3:30 pm
    dinnerMinutes: 18 * 60,            // 6:00 pm: bed unlocks
    forcedBedMinutes: 24 * 60,         // midnight: forced to bed
    gameMinutesPerSecond: 1.0,         // 2.5 real minutes from 3:30 to dinner
    // Discovery (3.3)
    sightRadius: 15,                   // m
    sightConeDot: 0.15,                // cells must be roughly in front of the camera (dot > this), plus a close ring
    closeRing: 4,                      // m: always discovered around the kid regardless of facing
    // Memory fog (3.4): distance from the nearest discovered cell
    fogHaze: 8,                        // 0..A thin haze
    fogThick: 25,                      // A..B thick
    fogDeep: 40,                       // past C discovered ground fades and the minimap goes black
    trailSeconds: 60,
    // Movement
    daySpeed: 5.5,
    dreamSpeed: 3.6,
    // Dream session (3.12)
    dreamSeconds: 240,                 // parents call after 4 real minutes
    voiceRampSeconds: 60,              // last minute: louder and more frequent
    voiceMinInterval: 18,              // s between ambient lines
    // Combat (3.10 proposal)
    heartThirds: 3,                    // three hits empty the chalk heart
    demonHp: 2,
    demonSpeed: 2.6,
    demonGrabSlow: 0.5,                // speed multiplier while grabbed
    demonBiteCooldown: 2.4,            // s between hits while in contact
    dodgeDistance: 3.0,
    dodgeInvuln: 0.5,
    baseEncounterBudget: 3,            // demons on a calm block
    tripEncounterBonus: 4,             // extra demons near the bus after the shoelace trip
  },

  // Calendar: each played day stands for about a week (design doc). Themed days are flavour only.
  calendar: [
    { week: 6, label: 'Week 6 · Tue', date: 'Oct 14', season: 'Autumn' },
    { week: 7, label: 'Week 7 · Thu', date: 'Oct 23', season: 'Autumn' },
    { week: 8, label: 'Week 8 · Fri', date: 'Oct 31', season: 'Autumn', theme: 'Halloween' },
    { week: 9, label: 'Week 9 · Mon', date: 'Nov 10', season: 'Autumn' },
    { week: 10, label: 'Week 10 · Wed', date: 'Nov 19', season: 'Autumn' },
    { week: 11, label: 'Week 11 · Tue', date: 'Nov 25', season: 'Autumn' },
  ],

  // Real-world items. tags drive the crafting fallback rules. icon names match the SVG symbols in index.html (#i-<icon>).
  items: {
    rope:       { name: 'Rope',        icon: 'rope',   tags: ['flexible', 'long'],          desc: 'Scratchy and about two metres long. Tied to a toy truck in the yard.' },
    padlock:    { name: 'Padlock',     icon: 'lock',   tags: ['metal', 'heavy', 'small'],   desc: 'Rusted shut. It was hanging off the side gate.' },
    ruler:      { name: 'Ruler',       icon: 'ruler',  tags: ['rigid', 'long', 'sharp'],    desc: 'From the desk in your room. There is a chip in one end.' },
    tape:       { name: 'Tape',        icon: 'tape',   tags: ['sticky', 'flexible'],        desc: 'Grey and sticky. Half a roll, left on the porch.' },
    ball:       { name: 'Ball',        icon: 'ball',   tags: ['round', 'bouncy'],           desc: 'Left on the grass. Still has air in it.' },
    torch:      { name: 'Flashlight',  icon: 'torch',  tags: ['light', 'metal'],            desc: 'The batteries are low. It flickers.' },
    marbles:    { name: 'Marbles',     icon: 'marbles',tags: ['round', 'small', 'many'],    desc: 'Your sister\'s. She left them by the sandbox.' },
    smallkey:   { name: 'Small key',   icon: 'key',    tags: ['metal', 'small', 'key'],     desc: 'Tucked into an old envelope in the mailbox.' },
    toysword:   { name: 'Toy sword',   icon: 'sword',  tags: ['rigid', 'long', 'wood'],     desc: 'Wooden. You painted the handle red two summers ago.' },
    kitestring: { name: 'Kite string', icon: 'string', tags: ['flexible', 'long', 'thin'],  desc: 'A whole spool. The kite is long gone.' },
    bottlecaps: { name: 'Bottle caps', icon: 'caps',   tags: ['metal', 'small', 'many'],    desc: 'Forty-one of them. You counted.' },
  },

  // Where items start. owner: 'chest' | 'world' (placed by world.js interactables) | a character id.
  startOwnership: {
    toysword: 'chest', kitestring: 'chest', bottlecaps: 'chest',
    rope: 'world', padlock: 'world', ruler: 'bedroom', tape: 'world', ball: 'world', torch: 'world', marbles: 'world', smallkey: 'world',
  },

  // Authored recipes (3.7). inputs are unordered. The result is hidden until the dream.
  recipes: [
    { inputs: ['rope', 'padlock'],       result: 'chain' },
    { inputs: ['ruler', 'tape'],         result: 'sword' },
    { inputs: ['kitestring', 'ruler'],   result: 'bow' },
    { inputs: ['rope', 'ball'],          result: 'flail' },
    { inputs: ['torch', 'kitestring'],   result: 'lantern' },
    { inputs: ['toysword', 'bottlecaps'],result: 'mace' },
  ],

  // Fallback rules: first match on the union of the two items' tags wins. Keeps "combining always makes something" true.
  fallbackRules: [
    { needs: ['flexible', 'metal'],  result: 'flail' },
    { needs: ['flexible', 'heavy'],  result: 'flail' },
    { needs: ['rigid', 'sharp'],     result: 'spear' },
    { needs: ['long', 'sharp'],      result: 'spear' },
    { needs: ['light'],              result: 'lantern' },
    { needs: ['round', 'flexible'],  result: 'sling' },
    { needs: ['many', 'rigid'],      result: 'mace' },
    { needs: [],                     result: 'lump' },
  ],

  // Dream items: what a combination becomes. kind 'weapon' | 'tool'. reach in m, damage in demon hp, swingTime in s per hit.
  dreamItems: {
    chain:   { name: 'Chain whip',  icon: 'chain', kind: 'weapon', damage: 1, reach: 3.4, arc: 2.2, swingTime: 0.55, reveal: 'A real chain, heavy in your hand. Yesterday it was only rope and a padlock.' },
    sword:   { name: 'Sword',       icon: 'sword', kind: 'weapon', damage: 2, reach: 2.2, arc: 1.6, swingTime: 0.45, reveal: 'A real blade. The ruler\'s chip is a notch in the steel.' },
    bow:     { name: 'Bow',         icon: 'bow',   kind: 'weapon', damage: 1, reach: 9.0, arc: 0.5, swingTime: 0.8,  reveal: 'String and a ruler. In here it is a bow, and the arrows come from nowhere.' },
    flail:   { name: 'Flail',       icon: 'flail', kind: 'weapon', damage: 2, reach: 2.8, arc: 2.6, swingTime: 0.9,  reveal: 'Something heavy on the end of something that bends. It swings slow and hits hard.' },
    spear:   { name: 'Spear',       icon: 'spear', kind: 'weapon', damage: 1, reach: 3.8, arc: 0.8, swingTime: 0.5,  reveal: 'Long and pointed. Keep them at the end of it.' },
    mace:    { name: 'Mace',        icon: 'mace',  kind: 'weapon', damage: 2, reach: 2.0, arc: 2.0, swingTime: 0.7,  reveal: 'The bottle caps are iron studs now.' },
    sling:   { name: 'Sling',       icon: 'sling', kind: 'weapon', damage: 1, reach: 7.0, arc: 0.4, swingTime: 0.7,  reveal: 'It throws whatever you were holding, hard.' },
    lantern: { name: 'Lantern',     icon: 'torch', kind: 'tool',   fogBonus: 1.6, reveal: 'A warm light. The fog gives you a little more room.' },
    lump:    { name: 'Lump',        icon: 'lump',  kind: 'weapon', damage: 1, reach: 1.8, arc: 2.0, swingTime: 0.6,  reveal: 'It is a thing. You are not sure what. It hits, a little.' },
    fists:   { name: 'Bare hands',  icon: 'fist',  kind: 'weapon', damage: 1, reach: 1.5, arc: 1.8, swingTime: 0.4,  reveal: 'You brought nothing. Your hands will have to do.' },
  },

  // Named places on the block (3.8). mood: -1 bad .. +1 good. Written by day events, read by the dream.
  places: {
    home:    { name: 'Home' },
    yard:    { name: 'The yard' },
    street:  { name: 'Maple Street' },
    busstop: { name: 'The bus stop' },
    gate:    { name: 'School gates' },
    fog:     { name: 'The edge of memory' },
  },

  // Day events that write to place records. Triggered by world.js interactables of type 'event'.
  events: {
    tripped: { place: 'busstop', mood: -0.6, text: 'Your shoelace. You trip stepping off the curb. Someone on the bus laughs.', subtitle: { speaker: '[From the bus window]', text: 'Nice one, laces!' } },
  },

  voices: {
    day: [
      'Dinner\'s at six!',
      'Don\'t forget your jacket!',
      'Did you do your homework?',
      'Stay where I can see you!',
      'Leave your sister\'s toys alone!',
    ],
    dinner: 'Dinner! Come wash up!',
    afterDinner: [
      'Don\'t stay up too late.',
      'Bed by midnight, I mean it.',
      'Is your room clean?',
    ],
    dream: [
      'Clean your room!',
      'Homework. Now.',
      'Were you listening to me?',
      'Don\'t track mud in here!',
      'What did I just say?',
      'You\'re not sleeping, are you?',
    ],
    wakeRamp: [
      'Time to get up.',
      'I won\'t say it again!',
      'UP! NOW!',
    ],
    daySpeaker: '[Muffled from the house]',
    dreamSpeaker: '[A stern voice, from everywhere]',
  },
};

// Pure helpers over the data. No DOM, no THREE.
SOI.craft = {
  // Returns the dream item id for two real item ids. Never fails.
  resolve(a, b) {
    const d = SOI.data;
    for (const r of d.recipes) {
      if ((r.inputs[0] === a && r.inputs[1] === b) || (r.inputs[0] === b && r.inputs[1] === a)) return r.result;
    }
    const tags = new Set([...(d.items[a]?.tags || []), ...(d.items[b]?.tags || [])]);
    for (const rule of d.fallbackRules) {
      if (rule.needs.every(t => tags.has(t))) return rule.result;
    }
    return 'lump';
  },
};

SOI.time = {
  // 'h:mm am/pm' from game minutes since midnight.
  clock(minutes) {
    const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    let h = Math.floor(m / 60), mm = m % 60;
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(mm).padStart(2, '0')} ${ampm}`;
  },
};
