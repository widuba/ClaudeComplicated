'use strict';

// ============================================================
// THE REPUBLIC — Core Game Logic
// A game of US political power, dark money, and betrayal
// ============================================================

const CONFIG = {
  CELL_W: 58,
  CELL_H: 44,
  MAP_COLS: 12,
  MAP_ROWS: 7,
  MAX_TURNS: 50,
  EV_WIN: 270,
  SCANDAL_THRESHOLD: 10,

  FACTIONS: {
    ESTABLISHMENT: {
      id: 0,
      name: 'The Establishment',
      abbr: 'EST',
      color: { primary: '#c9a227', mid: '#8a6e1a', light: '#f0d060', dark: '#3a2a05' },
      desc: 'Old money, old rules. Controls institutions.',
      startBonus: { funds: 60, media: 30, ground: 20, capital: 40 }
    },
    MOVEMENT: {
      id: 1,
      name: 'The Movement',
      abbr: 'MOV',
      color: { primary: '#cc2222', mid: '#881818', light: '#ff6666', dark: '#2a0505' },
      desc: 'Populist rage. Thrives on chaos and grievance.',
      startBonus: { funds: 30, media: 50, ground: 40, capital: 30 }
    },
    PROGRESSIVES: {
      id: 2,
      name: 'The Progressives',
      abbr: 'PRG',
      color: { primary: '#2a9d4a', mid: '#1a6a32', light: '#55dd77', dark: '#052a10' },
      desc: 'Coalition builders. Strong in cities and coasts.',
      startBonus: { funds: 40, media: 40, ground: 50, capital: 20 }
    },
    CORPORATE: {
      id: 3,
      name: 'The Corporate Bloc',
      abbr: 'CORP',
      color: { primary: '#2255cc', mid: '#163588', light: '#5588ff', dark: '#050f2a' },
      desc: 'Capital controls policy. Always has an exit strategy.',
      startBonus: { funds: 80, media: 20, ground: 10, capital: 50 }
    },
    TECH: {
      id: 4,
      name: 'The Tech Oligarchy',
      abbr: 'TECH',
      color: { primary: '#00c8c8', mid: '#008080', light: '#55ffff', dark: '#002a2a' },
      desc: 'Data is power. Invisible and everywhere.',
      startBonus: { funds: 50, media: 60, ground: 10, capital: 30 }
    },
    HEARTLAND: {
      id: 5,
      name: 'The Heartland Alliance',
      abbr: 'HRT',
      color: { primary: '#d4822a', mid: '#8a5518', light: '#ffbb55', dark: '#2a1505' },
      desc: 'Rural roots. Plays long and patient.',
      startBonus: { funds: 35, media: 20, ground: 60, capital: 35 }
    },
  },

  OPERATIONS: {
    OPERATIVE: {
      name: 'Campaign Operative',
      icon: '🕴',
      cost: { funds: 15, capital: 5 },
      upkeep: { funds: 3 },
      attack: 3, defense: 2, move: 2,
      desc: 'Versatile ground-level agent.'
    },
    MEDIA_TEAM: {
      name: 'Media Team',
      icon: '📡',
      cost: { funds: 20, media: 10 },
      upkeep: { funds: 4, media: 2 },
      attack: 5, defense: 1, move: 1,
      desc: 'Amplifies narrative. Weak in a fight.'
    },
    GRASSROOTS: {
      name: 'Grassroots Network',
      icon: '✊',
      cost: { funds: 10, ground: 15 },
      upkeep: { ground: 2 },
      attack: 2, defense: 4, move: 1,
      desc: 'Cheap, dug-in, hard to dislodge.'
    },
    DARK_MONEY: {
      name: 'Dark Money PAC',
      icon: '💼',
      cost: { funds: 30 },
      upkeep: { funds: 5 },
      attack: 6, defense: 1, move: 3,
      stealthy: true,
      desc: 'Fast-moving. Hidden from rivals until it strikes.'
    },
    OPP_RESEARCH: {
      name: 'Opposition Researcher',
      icon: '🔍',
      cost: { funds: 25, capital: 10 },
      upkeep: { funds: 4 },
      attack: 2, defense: 1, move: 2,
      canScandalize: true,
      desc: 'Exposes opponents. Raises their scandal level.'
    },
    POWER_BROKER: {
      name: 'Power Broker',
      icon: '🤝',
      cost: { funds: 40, capital: 20 },
      upkeep: { funds: 8, capital: 3 },
      attack: 8, defense: 5, move: 1,
      desc: 'Elite operative. Supreme in any theater.'
    },
  },

  POLICIES: {
    SOCIAL_MEDIA:    { name: 'Social Media Blitz',    branch: 'Digital',   tier: 1, cost: { funds: 30, media: 20 },    effect: 'Media income +25%',                      icon: '📱' },
    MICRO_TARGETING: { name: 'Micro-Targeting AI',    branch: 'Digital',   tier: 2, cost: { funds: 50, media: 30 },    effect: 'See all rival ops in range',              icon: '🎯' },
    DEEP_FAKE:       { name: 'Synthetic Media',        branch: 'Digital',   tier: 3, cost: { funds: 80, media: 50 },    effect: 'Double scandal from Opp Research',        icon: '🤖' },
    RALLY_CIRCUIT:   { name: 'Rally Circuit',          branch: 'Populist',  tier: 1, cost: { funds: 25, ground: 20 },   effect: 'Ground income +25%',                      icon: '📢' },
    BASE_ACTIVATION: { name: 'Base Activation',        branch: 'Populist',  tier: 2, cost: { funds: 40, ground: 30 },   effect: 'Grassroots +2 defense',                   icon: '🔥' },
    VOTER_SURGE:     { name: 'Voter Surge Machine',    branch: 'Populist',  tier: 3, cost: { funds: 60, ground: 50 },   effect: '+1 EV from every owned state',            icon: '🗳' },
    OPPO_NETWORK:    { name: 'Opposition Network',     branch: 'Dark Arts', tier: 1, cost: { funds: 35, capital: 20 },  effect: 'Opp Research range +1',                   icon: '🕵' },
    DARK_OPS:        { name: 'Dark Operations',        branch: 'Dark Arts', tier: 2, cost: { funds: 55, capital: 30 },  effect: 'Dark Money PAC +2 move',                  icon: '🌑' },
    REGIME_CAPTURE:  { name: 'Institutional Capture',  branch: 'Dark Arts', tier: 3, cost: { funds: 90, capital: 50 },  effect: '+3 to all attack values',                 icon: '🏛' },
    UNITY_PLEDGE:    { name: 'Unity Pledge',           branch: 'Coalition', tier: 1, cost: { funds: 20, capital: 15 },  effect: 'Coalition break costs +15 rep',           icon: '🕊' },
    SUPERDELEGATE:   { name: 'Superdelegate Network',  branch: 'Coalition', tier: 2, cost: { funds: 45, capital: 25 },  effect: 'Receive 5 capital per coalition partner', icon: '🎖' },
    PARTY_MACHINE:   { name: 'Party Machine',          branch: 'Coalition', tier: 3, cost: { funds: 70, capital: 40 },  effect: 'Start each turn with +10 capital',        icon: '⚙' },
  },

  COALITION_TYPES: {
    NON_COMPETE:  { name: 'Non-Compete Pact',    duration: 5,  repCost: 20, desc: 'Neither attacks the other.' },
    FUNDING_PACT: { name: 'Funding Pact',        duration: -1, repCost: 15, desc: 'Share 10% of fund income each turn.' },
    OPP_ALLIANCE: { name: 'Opposition Alliance', duration: -1, repCost: 30, desc: '+2 attack vs shared enemies.' },
  },

  STATE_TYPES: {
    SAFE_BLUE:  { name: 'Safe Blue',    color: '#0d2a5a', border: '#1a4a9a', defBonus: 3, income: { funds: 8, media: 4, ground: 2, capital: 3 } },
    LEAN_BLUE:  { name: 'Lean Blue',    color: '#1a3a6a', border: '#2255aa', defBonus: 2, income: { funds: 5, media: 3, ground: 2, capital: 2 } },
    SWING:      { name: 'Swing State',  color: '#3a1a4a', border: '#7a3a8a', defBonus: 1, income: { funds: 6, media: 5, ground: 4, capital: 4 } },
    LEAN_RED:   { name: 'Lean Red',     color: '#5a1a1a', border: '#aa2222', defBonus: 2, income: { funds: 4, media: 3, ground: 4, capital: 2 } },
    RURAL_RED:  { name: 'Rural Red',    color: '#3a0a0a', border: '#772222', defBonus: 3, income: { funds: 3, media: 2, ground: 5, capital: 2 } },
    DC:         { name: 'D.C.',         color: '#2a0a3a', border: '#8a22aa', defBonus: 4, income: { funds: 10, media: 8, ground: 2, capital: 8 } },
  },

  STATES: {
    WA:  { col: 0,  row: 0, ev: 12, lean: 'SAFE_BLUE',  abbr: 'WA', name: 'Washington' },
    MT:  { col: 1,  row: 0, ev: 4,  lean: 'RURAL_RED',  abbr: 'MT', name: 'Montana' },
    ND:  { col: 2,  row: 0, ev: 3,  lean: 'RURAL_RED',  abbr: 'ND', name: 'N. Dakota' },
    MN:  { col: 3,  row: 0, ev: 10, lean: 'LEAN_BLUE',  abbr: 'MN', name: 'Minnesota' },
    VT:  { col: 8,  row: 0, ev: 3,  lean: 'SAFE_BLUE',  abbr: 'VT', name: 'Vermont' },
    NH:  { col: 9,  row: 0, ev: 4,  lean: 'LEAN_BLUE',  abbr: 'NH', name: 'N. Hampshire' },
    ME:  { col: 10, row: 0, ev: 4,  lean: 'LEAN_BLUE',  abbr: 'ME', name: 'Maine' },

    OR:  { col: 0,  row: 1, ev: 8,  lean: 'LEAN_BLUE',  abbr: 'OR', name: 'Oregon' },
    ID:  { col: 1,  row: 1, ev: 4,  lean: 'RURAL_RED',  abbr: 'ID', name: 'Idaho' },
    WY:  { col: 2,  row: 1, ev: 3,  lean: 'RURAL_RED',  abbr: 'WY', name: 'Wyoming' },
    SD:  { col: 3,  row: 1, ev: 3,  lean: 'RURAL_RED',  abbr: 'SD', name: 'S. Dakota' },
    WI:  { col: 4,  row: 1, ev: 10, lean: 'SWING',      abbr: 'WI', name: 'Wisconsin' },
    MI:  { col: 5,  row: 1, ev: 15, lean: 'SWING',      abbr: 'MI', name: 'Michigan' },
    NY:  { col: 7,  row: 1, ev: 28, lean: 'SAFE_BLUE',  abbr: 'NY', name: 'New York' },
    MA:  { col: 9,  row: 1, ev: 11, lean: 'SAFE_BLUE',  abbr: 'MA', name: 'Massachusetts' },

    CA:  { col: 0,  row: 2, ev: 54, lean: 'SAFE_BLUE',  abbr: 'CA', name: 'California' },
    NV:  { col: 1,  row: 2, ev: 6,  lean: 'LEAN_BLUE',  abbr: 'NV', name: 'Nevada' },
    UT:  { col: 2,  row: 2, ev: 6,  lean: 'LEAN_RED',   abbr: 'UT', name: 'Utah' },
    CO:  { col: 3,  row: 2, ev: 10, lean: 'LEAN_BLUE',  abbr: 'CO', name: 'Colorado' },
    NE:  { col: 4,  row: 2, ev: 5,  lean: 'RURAL_RED',  abbr: 'NE', name: 'Nebraska' },
    IA:  { col: 5,  row: 2, ev: 6,  lean: 'LEAN_RED',   abbr: 'IA', name: 'Iowa' },
    IL:  { col: 6,  row: 2, ev: 19, lean: 'SAFE_BLUE',  abbr: 'IL', name: 'Illinois' },
    OH:  { col: 7,  row: 2, ev: 17, lean: 'SWING',      abbr: 'OH', name: 'Ohio' },
    PA:  { col: 8,  row: 2, ev: 19, lean: 'SWING',      abbr: 'PA', name: 'Pennsylvania' },
    NJ:  { col: 10, row: 2, ev: 14, lean: 'LEAN_BLUE',  abbr: 'NJ', name: 'New Jersey' },
    CT:  { col: 11, row: 2, ev: 7,  lean: 'SAFE_BLUE',  abbr: 'CT', name: 'Connecticut' },

    AZ:  { col: 1,  row: 3, ev: 11, lean: 'SWING',      abbr: 'AZ', name: 'Arizona' },
    NM:  { col: 2,  row: 3, ev: 5,  lean: 'LEAN_BLUE',  abbr: 'NM', name: 'New Mexico' },
    KS:  { col: 3,  row: 3, ev: 6,  lean: 'LEAN_RED',   abbr: 'KS', name: 'Kansas' },
    MO:  { col: 4,  row: 3, ev: 10, lean: 'LEAN_RED',   abbr: 'MO', name: 'Missouri' },
    IN:  { col: 5,  row: 3, ev: 11, lean: 'LEAN_RED',   abbr: 'IN', name: 'Indiana' },
    KY:  { col: 6,  row: 3, ev: 8,  lean: 'RURAL_RED',  abbr: 'KY', name: 'Kentucky' },
    WV:  { col: 7,  row: 3, ev: 4,  lean: 'RURAL_RED',  abbr: 'WV', name: 'W. Virginia' },
    VA:  { col: 8,  row: 3, ev: 13, lean: 'LEAN_BLUE',  abbr: 'VA', name: 'Virginia' },
    MD:  { col: 9,  row: 3, ev: 10, lean: 'SAFE_BLUE',  abbr: 'MD', name: 'Maryland' },
    DE:  { col: 10, row: 3, ev: 3,  lean: 'SAFE_BLUE',  abbr: 'DE', name: 'Delaware' },
    RI:  { col: 11, row: 3, ev: 4,  lean: 'SAFE_BLUE',  abbr: 'RI', name: 'Rhode Island' },

    OK:  { col: 3,  row: 4, ev: 7,  lean: 'RURAL_RED',  abbr: 'OK', name: 'Oklahoma' },
    AR:  { col: 4,  row: 4, ev: 6,  lean: 'RURAL_RED',  abbr: 'AR', name: 'Arkansas' },
    TN:  { col: 5,  row: 4, ev: 11, lean: 'RURAL_RED',  abbr: 'TN', name: 'Tennessee' },
    AL:  { col: 6,  row: 4, ev: 9,  lean: 'RURAL_RED',  abbr: 'AL', name: 'Alabama' },
    MS:  { col: 7,  row: 4, ev: 6,  lean: 'RURAL_RED',  abbr: 'MS', name: 'Mississippi' },
    GA:  { col: 8,  row: 4, ev: 16, lean: 'SWING',      abbr: 'GA', name: 'Georgia' },
    NC:  { col: 9,  row: 4, ev: 16, lean: 'SWING',      abbr: 'NC', name: 'N. Carolina' },
    DC:  { col: 10, row: 4, ev: 3,  lean: 'DC',         abbr: 'DC', name: 'D.C.' },

    TX:  { col: 3,  row: 5, ev: 40, lean: 'LEAN_RED',   abbr: 'TX', name: 'Texas' },
    LA:  { col: 4,  row: 5, ev: 8,  lean: 'RURAL_RED',  abbr: 'LA', name: 'Louisiana' },
    FL:  { col: 7,  row: 5, ev: 30, lean: 'SWING',      abbr: 'FL', name: 'Florida' },
    SC:  { col: 9,  row: 5, ev: 9,  lean: 'LEAN_RED',   abbr: 'SC', name: 'S. Carolina' },

    HI:  { col: 0,  row: 6, ev: 4,  lean: 'SAFE_BLUE',  abbr: 'HI', name: 'Hawaii' },
    AK:  { col: 1,  row: 6, ev: 3,  lean: 'RURAL_RED',  abbr: 'AK', name: 'Alaska' },
  },

  ADJACENCY_OVERRIDES: [
    ['NY', 'NJ'], ['NY', 'CT'], ['MA', 'RI'], ['MA', 'CT'],
    ['VA', 'DC'], ['TX', 'NM'], ['ME', 'NH'],
  ],

  FACTION_STARTS: {
    0: ['WA', 'OR', 'CA'],
    1: ['PA', 'OH', 'WV'],
    2: ['NY', 'NJ', 'MA'],
    3: ['IL', 'IN', 'MI'],
    4: ['TX', 'OK', 'AR'],
    5: ['ND', 'SD', 'MT'],
  },

  AI_PERSONALITIES: {
    HAWK:         { weights: { attack: 0.7, expand: 0.8, defend: 0.3, media: 0.2, money: 0.5 } },
    DEALMAKER:    { weights: { attack: 0.2, expand: 0.4, defend: 0.6, media: 0.4, money: 0.8 } },
    PROPAGANDIST: { weights: { attack: 0.3, expand: 0.5, defend: 0.5, media: 0.9, money: 0.4 } },
    SCHEMER:      { weights: { attack: 0.5, expand: 0.6, defend: 0.4, media: 0.6, money: 0.6 } },
    POPULIST:     { weights: { attack: 0.6, expand: 0.7, defend: 0.5, media: 0.7, money: 0.3 } },
  },
};

// ── Build adjacency map from grid + overrides ─────────────────
function buildAdjacency() {
  const adj = {};
  const stateKeys = Object.keys(CONFIG.STATES);
  for (const k of stateKeys) adj[k] = new Set();

  for (const a of stateKeys) {
    const sa = CONFIG.STATES[a];
    for (const b of stateKeys) {
      if (a === b) continue;
      const sb = CONFIG.STATES[b];
      if (Math.abs(sa.col - sb.col) <= 1 && Math.abs(sa.row - sb.row) <= 1) {
        adj[a].add(b);
        adj[b].add(a);
      }
    }
  }

  for (const [a, b] of CONFIG.ADJACENCY_OVERRIDES) {
    if (adj[a] && adj[b]) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }

  const result = {};
  for (const k of stateKeys) result[k] = [...adj[k]];
  return result;
}

const ADJACENCY = buildAdjacency();

// ── Territory (State) ─────────────────────────────────────────
class Territory {
  constructor(abbr) {
    const def       = CONFIG.STATES[abbr];
    this.abbr       = abbr;
    this.name       = def.name;
    this.col        = def.col;
    this.row        = def.row;
    this.ev         = def.ev;
    this.lean       = def.lean;
    this.owner      = null;
    this.ops        = [];
    this.entrenched = 0;
  }
}

// ── Operation (unit) instance ─────────────────────────────────
class Operation {
  constructor(type, owner) {
    this.type  = type;
    this.owner = owner;
    this.moved = false;
  }
}

// ── Coalition instance ────────────────────────────────────────
class Coalition {
  constructor(type, p1, p2, turn) {
    this.type     = type;
    this.p1       = p1;
    this.p2       = p2;
    this.turnMade = turn;
    this.duration = CONFIG.COALITION_TYPES[type].duration;
    this.active   = true;
    this.pending  = false;
  }
}

// ── GameState ─────────────────────────────────────────────────
class GameState {
  constructor() {
    this.players     = [];
    this.territories = {};
    this.coalitions  = [];
    this.turn        = 1;
    this.phase       = 'DIPLOMACY';
    this.currentPIdx = 0;
    this.log         = [];
    this.winner      = null;
    this.winType     = null;
  }

  init(playerConfigs) {
    this.players = playerConfigs.map((cfg, i) => ({
      id:           i,
      name:         cfg.name,
      faction:      cfg.faction,
      isAI:         cfg.isAI,
      aiPersonality: cfg.aiPersonality || 'SCHEMER',
      color:        CONFIG.FACTIONS[cfg.faction].color,
      resources:    { ...CONFIG.FACTIONS[cfg.faction].startBonus },
      policies:     new Set(),
      reputation:   50,
      exposure:     0,
      alive:        true,
    }));

    for (const abbr of Object.keys(CONFIG.STATES)) {
      this.territories[abbr] = new Territory(abbr);
    }

    for (let i = 0; i < this.players.length; i++) {
      const starts = CONFIG.FACTION_STARTS[i] || [];
      for (const abbr of starts) {
        if (this.territories[abbr]) {
          this.territories[abbr].owner = i;
          this.territories[abbr].ops.push(new Operation('OPERATIVE', i));
          this.territories[abbr].ops.push(new Operation('GRASSROOTS', i));
        }
      }
    }

    this.addLog('system', `The Republic begins. ${this.players.length} factions vie for ${CONFIG.EV_WIN} electoral votes.`);
    this.startPlayerTurn(0);
  }

  // ── Resources ─────────────────────────────────────────────

  getIncome(playerId) {
    const p   = this.players[playerId];
    const inc = { funds: 0, media: 0, ground: 0, capital: 0 };
    for (const t of Object.values(this.territories)) {
      if (t.owner !== playerId) continue;
      const stDef = CONFIG.STATE_TYPES[t.lean];
      for (const [res, val] of Object.entries(stDef.income)) {
        inc[res] = (inc[res] || 0) + val;
      }
    }
    if (p.policies.has('SOCIAL_MEDIA'))  inc.media  = Math.floor(inc.media  * 1.25);
    if (p.policies.has('RALLY_CIRCUIT')) inc.ground = Math.floor(inc.ground * 1.25);
    if (p.policies.has('PARTY_MACHINE')) inc.capital = (inc.capital || 0) + 10;
    for (const c of this.getActiveCoalitions(playerId)) {
      if (c.type === 'FUNDING_PACT') {
        const partnerId = c.p1 === playerId ? c.p2 : c.p1;
        const pBase = this._baseIncome(partnerId);
        inc.funds = (inc.funds || 0) + Math.floor(pBase.funds * 0.1);
      }
    }
    return inc;
  }

  _baseIncome(playerId) {
    const inc = { funds: 0, media: 0, ground: 0, capital: 0 };
    for (const t of Object.values(this.territories)) {
      if (t.owner !== playerId) continue;
      const stDef = CONFIG.STATE_TYPES[t.lean];
      for (const [res, val] of Object.entries(stDef.income)) {
        inc[res] = (inc[res] || 0) + val;
      }
    }
    return inc;
  }

  getUpkeep(playerId) {
    const up = { funds: 0, media: 0, ground: 0, capital: 0 };
    for (const t of Object.values(this.territories)) {
      for (const op of t.ops) {
        if (op.owner !== playerId) continue;
        const def = CONFIG.OPERATIONS[op.type];
        for (const [res, val] of Object.entries(def.upkeep)) {
          up[res] = (up[res] || 0) + val;
        }
      }
    }
    return up;
  }

  collectResources(playerId) {
    const p  = this.players[playerId];
    const inc = this.getIncome(playerId);
    const up  = this.getUpkeep(playerId);
    for (const res of ['funds', 'media', 'ground', 'capital']) {
      p.resources[res] = Math.max(0, (p.resources[res] || 0) + (inc[res] || 0) - (up[res] || 0));
    }
    if (p.resources.funds <= 0) this._disbandOps(playerId, 1);
  }

  _disbandOps(playerId, count) {
    let disbanded = 0;
    for (const t of Object.values(this.territories)) {
      t.ops = t.ops.filter(op => {
        if (op.owner !== playerId || disbanded >= count) return true;
        const hasUpkeep = Object.values(CONFIG.OPERATIONS[op.type].upkeep).some(v => v > 0);
        if (hasUpkeep) { disbanded++; return false; }
        return true;
      });
    }
    if (disbanded > 0) this.addLog(playerId, `${disbanded} ops disbanded (funding crisis).`);
  }

  // ── Electoral Votes ───────────────────────────────────────

  getEV(playerId) {
    let ev = 0;
    const p = this.players[playerId];
    for (const t of Object.values(this.territories)) {
      if (t.owner !== playerId) continue;
      ev += t.ev;
      if (p.policies.has('VOTER_SURGE')) ev += 1;
    }
    return ev;
  }

  // ── Deploy Operations ─────────────────────────────────────

  canDeploy(playerId, stateAbbr, opType) {
    const p   = this.players[playerId];
    const t   = this.territories[stateAbbr];
    if (!t || t.owner !== playerId) return { ok: false, reason: 'Not your state.' };
    const def = CONFIG.OPERATIONS[opType];
    for (const [res, val] of Object.entries(def.cost)) {
      if ((p.resources[res] || 0) < val) return { ok: false, reason: `Need ${val} ${res}.` };
    }
    return { ok: true };
  }

  deployOp(playerId, stateAbbr, opType) {
    const chk = this.canDeploy(playerId, stateAbbr, opType);
    if (!chk.ok) return chk;
    const p   = this.players[playerId];
    const def = CONFIG.OPERATIONS[opType];
    for (const [res, val] of Object.entries(def.cost)) p.resources[res] -= val;
    this.territories[stateAbbr].ops.push(new Operation(opType, playerId));
    this.addLog(playerId, `Deployed ${def.name} in ${stateAbbr}.`);
    return { ok: true };
  }

  entrenchState(playerId, stateAbbr) {
    const p = this.players[playerId];
    const t = this.territories[stateAbbr];
    if (!t || t.owner !== playerId) return { ok: false, reason: 'Not your state.' };
    if (t.entrenched >= 3) return { ok: false, reason: 'Max entrenchment reached.' };
    const cost = 25 + t.entrenched * 15;
    if (p.resources.funds < cost) return { ok: false, reason: `Need ${cost} funds.` };
    p.resources.funds -= cost;
    t.entrenched++;
    this.addLog(playerId, `Entrenched in ${stateAbbr} (level ${t.entrenched}).`);
    return { ok: true };
  }

  // ── Research Policies ─────────────────────────────────────

  canResearch(playerId, policyKey) {
    const p   = this.players[playerId];
    const def = CONFIG.POLICIES[policyKey];
    if (!def) return { ok: false, reason: 'Unknown policy.' };
    if (p.policies.has(policyKey)) return { ok: false, reason: 'Already researched.' };
    if (def.tier > 1) {
      const prereq = Object.entries(CONFIG.POLICIES).find(([k, v]) => v.branch === def.branch && v.tier === def.tier - 1);
      if (prereq && !p.policies.has(prereq[0])) return { ok: false, reason: 'Missing prerequisite policy.' };
    }
    for (const [res, val] of Object.entries(def.cost)) {
      if ((p.resources[res] || 0) < val) return { ok: false, reason: `Need ${val} ${res}.` };
    }
    return { ok: true };
  }

  researchPolicy(playerId, policyKey) {
    const chk = this.canResearch(playerId, policyKey);
    if (!chk.ok) return chk;
    const p   = this.players[playerId];
    const def = CONFIG.POLICIES[policyKey];
    for (const [res, val] of Object.entries(def.cost)) p.resources[res] -= val;
    p.policies.add(policyKey);
    this.addLog(playerId, `Passed: ${def.name}.`);
    return { ok: true };
  }

  // ── Movement & Attack ─────────────────────────────────────

  getMoveRange(stateAbbr, opTypes, playerId) {
    if (!opTypes || opTypes.length === 0) return new Map();
    const maxMove = Math.max(...opTypes.map(t => {
      const def = CONFIG.OPERATIONS[t];
      let m = def.move;
      if (t === 'DARK_MONEY' && this.players[playerId]?.policies?.has('DARK_OPS')) m += 2;
      return m;
    }));
    const visited = new Map([[stateAbbr, 0]]);
    const queue   = [{ abbr: stateAbbr, dist: 0 }];
    while (queue.length) {
      const { abbr, dist } = queue.shift();
      if (dist >= maxMove) continue;
      for (const nb of (ADJACENCY[abbr] || [])) {
        if (!visited.has(nb)) {
          visited.set(nb, dist + 1);
          queue.push({ abbr: nb, dist: dist + 1 });
        }
      }
    }
    visited.delete(stateAbbr);
    return visited;
  }

  moveOps(fromAbbr, toAbbr, playerId, opTypes) {
    const from = this.territories[fromAbbr];
    const to   = this.territories[toAbbr];
    if (!from || !to) return { ok: false, reason: 'Invalid state.' };

    const range = this.getMoveRange(fromAbbr, opTypes, playerId);
    if (!range.has(toAbbr)) return { ok: false, reason: 'Out of range.' };

    const toMove    = [];
    const remaining = [];
    for (const op of from.ops) {
      if (op.owner === playerId && opTypes.includes(op.type) && !op.moved) {
        toMove.push(op);
      } else {
        remaining.push(op);
      }
    }
    if (toMove.length === 0) return { ok: false, reason: 'No eligible ops available.' };

    const isHostile = to.owner !== null && to.owner !== playerId && !this.areAllied(playerId, to.owner);

    if (isHostile) {
      return this._resolveAttack(from, to, toMove, remaining, playerId);
    } else {
      toMove.forEach(op => { op.moved = true; to.ops.push(op); });
      from.ops = remaining;
      this.addLog(playerId, `Moved ops from ${fromAbbr} → ${toAbbr}.`);
      return { ok: true };
    }
  }

  _resolveAttack(from, to, attackers, remaining, attackerId) {
    const defId  = to.owner;
    const stDef  = CONFIG.STATE_TYPES[to.lean];
    const p      = this.players[attackerId];

    let atkStr = attackers.reduce((s, op) => {
      let atk = CONFIG.OPERATIONS[op.type].attack;
      if (p.policies.has('REGIME_CAPTURE')) atk += 3;
      if (defId !== null) {
        for (const c of this.getActiveCoalitions(attackerId)) {
          if (c.type === 'OPP_ALLIANCE') {
            const partnerId = c.p1 === attackerId ? c.p2 : c.p1;
            if (this.areAtWar(partnerId, defId)) atk += 2;
          }
        }
      }
      return s + atk;
    }, 0);

    const defenders = defId !== null ? to.ops.filter(op => op.owner === defId) : [];
    let defStr = defenders.reduce((s, op) => {
      let def = CONFIG.OPERATIONS[op.type].defense;
      if (this.players[defId]?.policies?.has('BASE_ACTIVATION') && op.type === 'GRASSROOTS') def += 2;
      return s + def;
    }, 0);
    defStr += stDef.defBonus + to.entrenched * 2;

    if (atkStr > defStr) {
      const casualties = Math.min(defenders.length, Math.ceil(defenders.length * 0.6));
      to.ops = to.ops.filter(op => op.owner !== defId).concat(defenders.slice(casualties));
      const prevOwner = to.owner;
      to.owner = attackerId;
      to.entrenched = Math.max(0, to.entrenched - 1);
      attackers.forEach(op => { op.moved = true; to.ops.push(op); });
      from.ops = remaining;
      const prevName = prevOwner !== null ? this.players[prevOwner].name : 'neutral territory';
      this.addLog(attackerId, `Seized ${to.abbr} (${to.ev} EV) from ${prevName}! [${atkStr} vs ${defStr}]`);
      if (defId !== null && this._ownedStates(defId).length === 0) {
        this.players[defId].alive = false;
        this.addLog('system', `${this.players[defId].name} has been eliminated!`);
      }
      return { ok: true, captured: true, atkStr, defStr };
    } else {
      const atkCas = Math.ceil(attackers.length * 0.5);
      const survivors = attackers.slice(atkCas);
      survivors.forEach(op => { op.moved = true; });
      from.ops = remaining.concat(survivors);
      this.addLog(attackerId, `Assault on ${to.abbr} repelled. [${atkStr} vs ${defStr}]`);
      return { ok: true, captured: false, atkStr, defStr };
    }
  }

  _ownedStates(playerId) {
    return Object.values(this.territories).filter(t => t.owner === playerId);
  }

  areAllied(a, b) {
    return this.getActiveCoalitions(a).some(c =>
      (c.p1 === a && c.p2 === b) || (c.p1 === b && c.p2 === a)
    );
  }

  areAtWar(a, b) {
    return !this.areAllied(a, b) && a !== b;
  }

  // ── Scandal System ────────────────────────────────────────

  triggerScandal(targetId, attackerId) {
    const boost = this.players[attackerId]?.policies?.has('DEEP_FAKE') ? 2 : 1;
    this.players[targetId].exposure = Math.min(20, (this.players[targetId].exposure || 0) + 2 * boost);
    if (this.players[targetId].exposure >= CONFIG.SCANDAL_THRESHOLD) {
      this.addLog('system', `SCANDAL ERUPTS: ${this.players[targetId].name} suffers a political meltdown!`);
      this.players[targetId].reputation = Math.max(0, (this.players[targetId].reputation || 50) - 20);
      this.players[targetId].exposure = 0;
    } else {
      this.addLog(attackerId, `Exposure op against ${this.players[targetId].name} (level ${this.players[targetId].exposure}/${CONFIG.SCANDAL_THRESHOLD}).`);
    }
  }

  // ── Coalitions ────────────────────────────────────────────

  getActiveCoalitions(playerId) {
    return this.coalitions.filter(c => c.active && (c.p1 === playerId || c.p2 === playerId));
  }

  getPendingCoalitions(playerId) {
    return this.coalitions.filter((c, i) => c.pending && c.p2 === playerId).map((c, _) => {
      return { coalition: c, idx: this.coalitions.indexOf(c) };
    });
  }

  proposeCoalition(type, proposerId, targetId) {
    if (proposerId === targetId) return { ok: false, reason: 'Cannot ally with self.' };
    if (this.areAllied(proposerId, targetId)) return { ok: false, reason: 'Coalition already exists.' };
    const def = CONFIG.COALITION_TYPES[type];
    this.players[proposerId].reputation = Math.max(0, (this.players[proposerId].reputation || 50) - def.repCost);
    const c = new Coalition(type, proposerId, targetId, this.turn);
    c.pending = true;
    c.active  = false;
    this.coalitions.push(c);
    this.addLog(proposerId, `Proposed ${def.name} with ${this.players[targetId].name}.`);
    return { ok: true, coalition: c };
  }

  acceptCoalition(coalitionIdx) {
    const c = this.coalitions[coalitionIdx];
    if (!c || !c.pending) return { ok: false };
    c.pending = false;
    c.active  = true;
    this.addLog(c.p2, `Accepted ${CONFIG.COALITION_TYPES[c.type].name} with ${this.players[c.p1].name}.`);
    return { ok: true };
  }

  breakCoalition(coalitionIdx, breakerId) {
    const c = this.coalitions[coalitionIdx];
    if (!c || !c.active) return { ok: false };
    c.active = false;
    const def = CONFIG.COALITION_TYPES[c.type];
    const repHit = this.players[breakerId]?.policies?.has('UNITY_PLEDGE') ? def.repCost + 15 : def.repCost;
    this.players[breakerId].reputation = Math.max(0, (this.players[breakerId].reputation || 50) - repHit);
    const otherId = c.p1 === breakerId ? c.p2 : c.p1;
    this.addLog(breakerId, `BETRAYED coalition with ${this.players[otherId].name}. Rep -${repHit}.`);
    return { ok: true };
  }

  // ── Victory Check ─────────────────────────────────────────

  checkVictory() {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (this.getEV(p.id) >= CONFIG.EV_WIN) {
        this.winner = p.id;
        this.winType = 'Electoral Domination (270+ EV)';
        return true;
      }
      if (p.resources.funds >= 500 && this._ownedStates(p.id).length >= 3) {
        this.winner = p.id;
        this.winType = 'Economic Capture';
        return true;
      }
      if (p.policies.size >= 8) {
        this.winner = p.id;
        this.winType = 'Policy Supremacy';
        return true;
      }
    }
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 1) {
      this.winner = alive[0].id;
      this.winType = 'Last Faction Standing';
      return true;
    }
    if (this.turn > CONFIG.MAX_TURNS) {
      const best = alive.sort((a, b) => this.getEV(b.id) - this.getEV(a.id))[0];
      this.winner = best.id;
      this.winType = 'Electoral Lead (Time Limit)';
      return true;
    }
    return false;
  }

  // ── Turn / Phase ──────────────────────────────────────────

  startPlayerTurn(playerId) {
    this.collectResources(playerId);
    for (const t of Object.values(this.territories)) {
      for (const op of t.ops) {
        if (op.owner === playerId) op.moved = false;
      }
    }
    for (const c of this.coalitions) {
      if (!c.active) continue;
      if (c.duration > 0 && (this.turn - c.turnMade) >= c.duration) {
        c.active = false;
        this.addLog('system', `Coalition between ${this.players[c.p1].name} & ${this.players[c.p2].name} expired.`);
      }
    }
    if (this.players[playerId]?.policies?.has('SUPERDELEGATE')) {
      const partners = this.getActiveCoalitions(playerId).length;
      this.players[playerId].resources.capital = (this.players[playerId].resources.capital || 0) + partners * 5;
    }
  }

  advancePhase() {
    const phases = ['DIPLOMACY', 'BUILD', 'MARCH'];
    const idx = phases.indexOf(this.phase);
    if (idx < phases.length - 1) {
      this.phase = phases[idx + 1];
      return false;
    } else {
      this.phase = phases[0];
      return true;
    }
  }

  endPlayerTurn() {
    const turnAdvanced = this.advancePhase();
    if (!turnAdvanced) return;

    let next    = this.currentPIdx;
    let checked = 0;
    do {
      next = (next + 1) % this.players.length;
      checked++;
      if (checked > this.players.length) break;
    } while (!this.players[next].alive);

    if (next <= this.currentPIdx) this.turn++;
    this.currentPIdx = next;
    this.startPlayerTurn(next);
  }

  addLog(src, msg) {
    const name = src === 'system'
      ? '🔔 System'
      : (src !== null && src !== undefined && this.players[src])
        ? `[${this.players[src].name}]`
        : '?';
    this.log.unshift({ turn: this.turn, src: name, msg });
    if (this.log.length > 100) this.log.pop();
  }

  getScore(playerId) {
    const p = this.players[playerId];
    return this.getEV(playerId) * 10
      + this._ownedStates(playerId).length * 5
      + p.policies.size * 8
      + Math.floor((p.resources.funds || 0) / 10)
      + (p.reputation || 0);
  }
}
