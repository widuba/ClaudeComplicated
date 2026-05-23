'use strict';

// ============================================================
// GRAND DOMINION — Complete Game Logic
// Strategy, Diplomacy, Betrayal. Zero luck.
// ============================================================

const CONFIG = {
  HEX_SIZE: 26,
  MAP_RADIUS: 7,
  MAX_TURNS: 60,
  AI_TURN_DELAY_MS: 600,

  TERRAINS: {
    PLAINS:    { name: 'Plains',       color: '#4a7c3f', light: '#5d9e50', resources: { food: 2 },                          defBonus: 0,  passable: true,  symbol: '≋' },
    FOREST:    { name: 'Forest',       color: '#2d5a27', light: '#3a7332', resources: { food: 1, knowledge: 1 },            defBonus: 1,  passable: true,  symbol: '♦' },
    HILLS:     { name: 'Hills',        color: '#7a6e55', light: '#9a8e6d', resources: { iron: 1, food: 1 },                 defBonus: 2,  passable: true,  symbol: '∧' },
    MOUNTAINS: { name: 'Mountains',    color: '#5a4d3e', light: '#6b5b4c', resources: {},                                   defBonus: 99, passable: false, symbol: '▲' },
    CITY:      { name: 'City',         color: '#8b6914', light: '#b8930a', resources: { gold: 3 },                          defBonus: 1,  passable: true,  symbol: '⌂' },
    PORT:      { name: 'Port',         color: '#1a5276', light: '#2471a3', resources: { gold: 2, food: 1 },                 defBonus: 0,  passable: true,  symbol: '⚓' },
    ANCIENT:   { name: 'Ancient Site', color: '#5b2c6f', light: '#7d3c98', resources: { knowledge: 3 },                    defBonus: 0,  passable: true,  symbol: '✦' },
    CAPITAL:   { name: 'Capital',      color: '#8e6b00', light: '#c9a227', resources: { gold: 3, food: 2, iron: 1, knowledge: 1 }, defBonus: 2, passable: true, symbol: '★' },
  },

  UNITS: {
    INFANTRY: {
      name: 'Infantry',     cost: { gold: 10, food: 5 },
      attack: 2, defense: 3, move: 1, upkeep: 1,
      icon: '⚔', color: '#aaa',
      desc: 'Solid all-rounder. Good defense.'
    },
    CAVALRY: {
      name: 'Cavalry',      cost: { gold: 15, food: 5, iron: 5 },
      attack: 4, defense: 2, move: 3, upkeep: 1,
      icon: '♞', color: '#f0a500',
      desc: 'Fast and powerful. Weak defense.'
    },
    ARTILLERY: {
      name: 'Artillery',    cost: { gold: 20, iron: 10 },
      attack: 6, defense: 1, move: 1, upkeep: 1, ranged: true,
      icon: '◉', color: '#e05050',
      desc: 'Devastating attack. Can fire from adjacent hex.'
    },
    SIEGE: {
      name: 'Siege Engine', cost: { gold: 25, iron: 15 },
      attack: 3, defense: 2, move: 1, upkeep: 1, siegeBonus: 6,
      icon: '◈', color: '#9b59b6',
      desc: '+6 attack vs fortified territories.'
    },
  },

  // Research tree: branch → tier → techId
  TECHS: {
    // ── MILITARY ──────────────────────────────────────────────
    STEEL_WEAPONS: {
      name: 'Steel Weapons', branch: 'military', tier: 1,
      cost: { knowledge: 15, iron: 8 }, requires: [],
      effect: 'All unit attack +1.',
      apply: (p) => { p.bonuses.attack = (p.bonuses.attack || 0) + 1; },
      icon: '⚔', color: '#e74c3c'
    },
    WAR_DOCTRINE: {
      name: 'War Doctrine',  branch: 'military', tier: 2,
      cost: { knowledge: 25, iron: 12 }, requires: ['STEEL_WEAPONS'],
      effect: 'All unit attack +1, defense +1.',
      apply: (p) => { p.bonuses.attack = (p.bonuses.attack || 0) + 1; p.bonuses.defense = (p.bonuses.defense || 0) + 1; },
      icon: '🎯', color: '#c0392b'
    },
    IMPERIAL_LEGIONS: {
      name: 'Imperial Legions', branch: 'military', tier: 3,
      cost: { knowledge: 40, iron: 20 }, requires: ['WAR_DOCTRINE'],
      effect: 'All unit attack +2, defense +1.',
      apply: (p) => { p.bonuses.attack = (p.bonuses.attack || 0) + 2; p.bonuses.defense = (p.bonuses.defense || 0) + 1; },
      icon: '🛡', color: '#a93226'
    },
    // ── ECONOMY ───────────────────────────────────────────────
    AGRICULTURE: {
      name: 'Agriculture',   branch: 'economy', tier: 1,
      cost: { knowledge: 12 }, requires: [],
      effect: 'Food production +50%.',
      apply: (p) => { p.bonuses.foodMult = (p.bonuses.foodMult || 1) * 1.5; },
      icon: '🌾', color: '#27ae60'
    },
    TRADE_ROUTES: {
      name: 'Trade Routes',  branch: 'economy', tier: 2,
      cost: { knowledge: 22, gold: 15 }, requires: ['AGRICULTURE'],
      effect: 'Gold production +50%.',
      apply: (p) => { p.bonuses.goldMult = (p.bonuses.goldMult || 1) * 1.5; },
      icon: '💰', color: '#229954'
    },
    INDUSTRIALIZATION: {
      name: 'Industrialization', branch: 'economy', tier: 3,
      cost: { knowledge: 35, gold: 20 }, requires: ['TRADE_ROUTES'],
      effect: 'Iron production +100%.',
      apply: (p) => { p.bonuses.ironMult = (p.bonuses.ironMult || 1) * 2; },
      icon: '⚙', color: '#1e8449'
    },
    // ── KNOWLEDGE ─────────────────────────────────────────────
    LIBRARIES: {
      name: 'Great Libraries', branch: 'knowledge', tier: 1,
      cost: { knowledge: 10, gold: 20 }, requires: [],
      effect: 'Knowledge production +75%.',
      apply: (p) => { p.bonuses.knowledgeMult = (p.bonuses.knowledgeMult || 1) * 1.75; },
      icon: '📚', color: '#2980b9'
    },
    UNIVERSITIES: {
      name: 'Universities',  branch: 'knowledge', tier: 2,
      cost: { knowledge: 25, gold: 30 }, requires: ['LIBRARIES'],
      effect: 'Can research 2 techs per turn.',
      apply: (p) => { p.bonuses.dualResearch = true; },
      icon: '🎓', color: '#1a6fa5'
    },
    GRAND_PHILOSOPHY: {
      name: 'Grand Philosophy', branch: 'knowledge', tier: 3,
      cost: { knowledge: 50 }, requires: ['UNIVERSITIES'],
      effect: 'Counts as +3 techs for Knowledge Victory.',
      apply: (p) => { p.bonuses.extraTechs = (p.bonuses.extraTechs || 0) + 3; },
      icon: '🔮', color: '#145a87'
    },
    // ── DIPLOMACY ─────────────────────────────────────────────
    AMBASSADORS: {
      name: 'Ambassadors',   branch: 'diplomacy', tier: 1,
      cost: { knowledge: 12, gold: 15 }, requires: [],
      effect: 'Can hold 3 agreements (default 2). Rep loss from betrayal -30%.',
      apply: (p) => { p.bonuses.maxAgreements = 3; p.bonuses.repProtection = true; },
      icon: '🤝', color: '#8e44ad'
    },
    SPY_NETWORK: {
      name: 'Spy Network',   branch: 'diplomacy', tier: 2,
      cost: { knowledge: 20, gold: 25 }, requires: ['AMBASSADORS'],
      effect: 'See exact enemy resource counts. Betrayal reveals hidden intentions.',
      apply: (p) => { p.bonuses.spyVision = true; },
      icon: '🕵', color: '#7d3c98'
    },
    PROPAGANDA: {
      name: 'Propaganda',    branch: 'diplomacy', tier: 3,
      cost: { knowledge: 35, gold: 35 }, requires: ['SPY_NETWORK'],
      effect: 'Once per 5 turns: convert 1 enemy unit in an adjacent territory.',
      apply: (p) => { p.bonuses.propaganda = true; p.bonuses.propagandaCooldown = 0; },
      icon: '📢', color: '#6c3483'
    },
  },

  AGREEMENTS: {
    NAP: {
      name: 'Non-Aggression Pact', icon: '🕊',
      duration: 6, repLoss: 25,
      desc: 'Cannot attack each other for 6 turns. Breaking costs 25 reputation.'
    },
    TRADE: {
      name: 'Trade Agreement', icon: '💱',
      duration: -1, repLoss: 12,
      desc: 'Share 15% of Gold production. Cancel with 2 turns notice.'
    },
    ALLIANCE: {
      name: 'Military Alliance', icon: '⚜',
      duration: -1, repLoss: 40,
      desc: 'Full military pact. +1 defense in shared borders. Share territory vision.'
    },
  },

  PLAYER_COLORS: [
    { primary: '#2563eb', mid: '#3b82f6', light: '#bfdbfe', name: 'Azurian Empire' },
    { primary: '#dc2626', mid: '#ef4444', light: '#fecaca', name: 'Crimson Kingdom' },
    { primary: '#16a34a', mid: '#22c55e', light: '#bbf7d0', name: 'Emerald Republic' },
    { primary: '#7c3aed', mid: '#8b5cf6', light: '#ede9fe', name: 'Violet Dominion' },
    { primary: '#d97706', mid: '#f59e0b', light: '#fde68a', name: 'Amber Dynasty' },
    { primary: '#0891b2', mid: '#06b6d4', light: '#cffafe', name: 'Teal Confederacy' },
  ],

  STARTING_POSITIONS: {
    3: [[0,-6],[5,2],[-5,4]],
    4: [[0,-6],[6,-2],[0,6],[-6,2]],
    5: [[0,-6],[6,-4],[3,4],[-3,5],[-6,2]],
    6: [[0,-6],[6,-4],[5,2],[-1,6],[-6,3],[-5,-1]],
  },

  AI_PERSONALITIES: [
    { id: 'CONQUEROR', name: 'The Conqueror', desc: 'Aggressive military expansion',  weights: { military:0.55, economy:0.15, tech:0.10, diplomacy:0.20 } },
    { id: 'MERCHANT',  name: 'The Merchant',  desc: 'Economic and trade dominance',   weights: { military:0.10, economy:0.55, tech:0.20, diplomacy:0.15 } },
    { id: 'SCHOLAR',   name: 'The Scholar',   desc: 'Technology above all',            weights: { military:0.10, economy:0.20, tech:0.55, diplomacy:0.15 } },
    { id: 'DIPLOMAT',  name: 'The Diplomat',  desc: 'Master of alliances and betrayal', weights: { military:0.15, economy:0.20, tech:0.15, diplomacy:0.50 } },
    { id: 'OPPORTUNIST',name:'The Opportunist',desc:'Exploits every weakness',          weights: { military:0.25, economy:0.25, tech:0.25, diplomacy:0.25 } },
  ],
};

// ============================================================
// HEX MATH
// ============================================================

const Hex = {
  dist(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
  },

  neighbors(q, r) {
    return [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]].map(([dq,dr]) => ({ q: q+dq, r: r+dr }));
  },

  toPixel(q, r, size) {
    return {
      x: size * (3/2 * q),
      y: size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r)
    };
  },

  fromPixel(px, py, size) {
    const q = (2/3 * px) / size;
    const r = (-1/3 * px + (Math.sqrt(3)/3) * py) / size;
    return Hex.round(q, r);
  },

  round(q, r) {
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq-q), dr = Math.abs(rr-r), ds = Math.abs(rs-s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq, r: rr };
  },

  key(q, r) { return `${q},${r}`; },
  parseKey(k) { const [q,r] = k.split(',').map(Number); return {q,r}; },

  ring(q, r, radius, territories) {
    const results = [];
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq-radius); dr <= Math.min(radius, -dq+radius); dr++) {
        const k = Hex.key(q+dq, r+dr);
        if (territories[k]) results.push(k);
      }
    }
    return results;
  },

  hexCorners(cx, cy, size) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i);
      corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
    }
    return corners;
  },
};

// ============================================================
// MAP GENERATION
// ============================================================

function generateMap(numPlayers) {
  const R = CONFIG.MAP_RADIUS;
  const territories = {};
  const adjacency   = {};

  // Terrain override sets
  const mountainSet = new Set([
    '3,-4','4,-4','3,-5','2,-5','4,-5',   // NE range
    '-3,-3','-4,-2','-4,-1','-2,-4',      // NW range
    '0,5','1,5','2,4','-1,5',             // South wall
    '-5,2','-5,1','-5,3',                 // Far west ridge
    '5,-3','5,-2','4,-3',                 // Far east ridge
    '1,-2','-1,2','2,-2','-2,2',          // Central spine
  ].map(k => k));

  const citySet = new Set([
    '0,0','3,1','-3,-1','1,-4','-1,4','4,2','-4,-2',
  ].map(k => k));

  const ancientSet = new Set([
    '1,-1','-1,1','0,-2','0,2','2,1','-2,-1',
  ].map(k => k));

  const portSet = new Set([
    '6,-1','7,-1','7,-2','7,0',
    '-6,1','-7,1','-7,0','-7,2',
    '0,-7','1,-7','2,-6',
    '0,7','-1,7','-2,6',
    '5,2','4,3','3,4',
    '-5,-1','-4,-2','-3,-4',
  ].map(k => k));

  const forestSet = new Set([
    '2,0','1,1','0,1','-1,0','0,-1','-1,-1',
    '3,-1','4,-2','4,-1',
    '-3,1','-4,2','-4,1',
    '2,-3','1,-3',
    '-2,3','-1,3',
    '2,3','3,3','-2,-3','-3,-3',
    '5,-1','5,1','-5,0','-5,-1',
  ].map(k => k));

  const hillSet = new Set([
    '2,-1','1,2','-2,1','-1,-2',
    '3,0','-3,0','0,3','0,-3',
    '4,1','-4,-1','1,4','-1,-4',
    '5,-4','5,-5','-5,4','-5,5',
    '3,-6','-3,6','6,-5','-6,5',
  ].map(k => k));

  // Capital positions
  const capitalPos = CONFIG.STARTING_POSITIONS[numPlayers] || CONFIG.STARTING_POSITIONS[4];
  const capitalSet = new Set(capitalPos.map(([q,r]) => Hex.key(q,r)));

  // Generate all hexes in the circle
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (Math.abs(q+r) <= R) {
        const k = Hex.key(q,r);
        let terrain;
        if      (capitalSet.has(k))  terrain = 'CAPITAL';
        else if (mountainSet.has(k)) terrain = 'MOUNTAINS';
        else if (citySet.has(k))     terrain = 'CITY';
        else if (ancientSet.has(k))  terrain = 'ANCIENT';
        else if (portSet.has(k))     terrain = 'PORT';
        else if (forestSet.has(k))   terrain = 'FOREST';
        else if (hillSet.has(k))     terrain = 'HILLS';
        else                         terrain = 'PLAINS';

        territories[k] = {
          q, r, key: k, terrain,
          owner: null,
          units: [],          // [{ id, type, owner }]
          fortification: 0,   // 0-4 stacked fortification level
        };
      }
    }
  }

  // Build adjacency (excluding impassable mountains from connections still stored but flagged)
  for (const k of Object.keys(territories)) {
    const { q, r } = territories[k];
    adjacency[k] = Hex.neighbors(q, r)
      .map(n => Hex.key(n.q, n.r))
      .filter(nk => territories[nk]);
  }

  return { territories, adjacency, capitalPositions: capitalPos };
}

// ============================================================
// GAME STATE
// ============================================================

let _unitIdCounter = 0;
function makeUnitId() { return `u${++_unitIdCounter}`; }

class GameState {
  constructor() {
    this.turn        = 1;
    this.phase       = 'DIPLOMACY'; // DIPLOMACY → BUILD → MOVE → (next player)
    this.currentPIdx = 0;
    this.players     = [];
    this.territories = {};
    this.adjacency   = {};
    this.log         = [];          // { msg, type, turn }
    this.agreements  = [];          // active agreements
    this.proposals   = [];          // pending proposals
    this.pendingMoves = [];         // moves queued this turn (for display)
    this.victory     = null;        // { playerId, type } or null
    this.techResearchedThisTurn = 0;
    this.supplyDebts = {};          // playerId → units disbanded last upkeep
  }

  init(numPlayers, playerConfigs) {
    const mapData = generateMap(numPlayers);
    this.territories = mapData.territories;
    this.adjacency   = mapData.adjacency;

    // Create players
    this.players = playerConfigs.map((cfg, i) => ({
      id:          i,
      name:        cfg.name || CONFIG.PLAYER_COLORS[i].name,
      color:       CONFIG.PLAYER_COLORS[i],
      isAI:        cfg.isAI || false,
      aiPersonality: cfg.personality || 'OPPORTUNIST',
      resources:   { gold: 60, food: 30, iron: 20, knowledge: 10 },
      techs:       [],     // list of techId strings
      bonuses:     {},     // accumulated tech bonuses
      reputation:  75,     // 0-100
      agreements:  [],     // agreementIds they are party to
      isAlive:     true,
      victoryPoints: 0,
    }));

    // Assign starting territories and units
    mapData.capitalPositions.forEach(([q, r], idx) => {
      const capitalKey = Hex.key(q, r);
      if (!this.territories[capitalKey]) return;

      this.territories[capitalKey].owner = idx;

      // Give 2 adjacent home territories
      const neighbors = this.adjacency[capitalKey] || [];
      let homeCount = 0;
      for (const nk of neighbors) {
        if (homeCount >= 2) break;
        const t = this.territories[nk];
        if (t && t.terrain !== 'MOUNTAINS' && t.owner === null) {
          t.owner = idx;
          homeCount++;
        }
      }

      // Starting units (2 infantry + 1 cavalry on capital)
      this.addUnits(capitalKey, idx, 'INFANTRY', 2);
      this.addUnits(capitalKey, idx, 'CAVALRY',  1);
    });

    this.log = [];
    this.addLog('Grand Dominion begins. May the shrewdest mind prevail.', 'system');
    this.currentPIdx = 0;
    this.startPlayerTurn();
  }

  // ── Resource helpers ──────────────────────────────────────

  getPlayerTerritories(playerId) {
    return Object.values(this.territories).filter(t => t.owner === playerId);
  }

  getIncome(playerId) {
    const p = this.players[playerId];
    const income = { gold: 0, food: 0, iron: 0, knowledge: 0 };
    for (const t of this.getPlayerTerritories(playerId)) {
      const res = CONFIG.TERRAINS[t.terrain].resources;
      for (const [k, v] of Object.entries(res)) income[k] = (income[k] || 0) + v;
    }
    // Apply tech bonuses
    income.food      = Math.floor(income.food      * (p.bonuses.foodMult      || 1));
    income.gold      = Math.floor(income.gold      * (p.bonuses.goldMult      || 1));
    income.iron      = Math.floor(income.iron      * (p.bonuses.ironMult      || 1));
    income.knowledge = Math.floor(income.knowledge * (p.bonuses.knowledgeMult || 1));

    // Trade agreement bonus: +15% gold for each active trade agreement
    const tradeAgreements = this.agreements.filter(
      a => a.type === 'TRADE' && (a.p1 === playerId || a.p2 === playerId)
    );
    income.gold += Math.floor(income.gold * 0.15 * tradeAgreements.length);

    return income;
  }

  getUpkeep(playerId) {
    const units = this.getPlayerUnits(playerId);
    return { food: units.length };   // 1 food per unit
  }

  collectResources(playerId) {
    const p = this.players[playerId];
    const income = this.getIncome(playerId);
    const upkeep = this.getUpkeep(playerId);

    for (const [k, v] of Object.entries(income)) p.resources[k] = (p.resources[k] || 0) + v;

    // Pay food upkeep — disband weakest units if can't pay
    let foodDebt = upkeep.food - p.resources.food;
    if (foodDebt > 0) {
      p.resources.food = 0;
      const disbanded = this.disbandWeakestUnits(playerId, foodDebt);
      if (disbanded > 0) {
        this.addLog(`${p.name} cannot afford upkeep — ${disbanded} unit(s) disbanded!`, 'warning');
      }
    } else {
      p.resources.food -= upkeep.food;
    }

    return income;
  }

  disbandWeakestUnits(playerId, count) {
    let disbanded = 0;
    const order = ['ARTILLERY', 'SIEGE', 'CAVALRY', 'INFANTRY']; // disband strongest first (cost the most)
    for (const type of order) {
      for (const t of Object.values(this.territories)) {
        if (disbanded >= count) break;
        const idx = t.units.findIndex(u => u.owner === playerId && u.type === type);
        if (idx !== -1) { t.units.splice(idx, 1); disbanded++; }
      }
      if (disbanded >= count) break;
    }
    return disbanded;
  }

  // ── Unit helpers ──────────────────────────────────────────

  addUnits(territoryKey, ownerId, type, count) {
    for (let i = 0; i < count; i++) {
      this.territories[territoryKey].units.push({ id: makeUnitId(), type, owner: ownerId });
    }
  }

  getPlayerUnits(playerId) {
    const units = [];
    for (const t of Object.values(this.territories)) {
      for (const u of t.units) {
        if (u.owner === playerId) units.push({ ...u, territory: t.key });
      }
    }
    return units;
  }

  buildUnit(playerId, territoryKey, unitType) {
    const p = this.players[playerId];
    const t = this.territories[territoryKey];
    if (!t || t.owner !== playerId) return { ok: false, reason: 'Not your territory.' };
    if (t.terrain === 'MOUNTAINS') return { ok: false, reason: 'Cannot build in mountains.' };

    const cost = CONFIG.UNITS[unitType].cost;
    for (const [res, amt] of Object.entries(cost)) {
      if ((p.resources[res] || 0) < amt) return { ok: false, reason: `Not enough ${res}.` };
    }
    for (const [res, amt] of Object.entries(cost)) p.resources[res] -= amt;

    this.addUnits(territoryKey, playerId, unitType, 1);
    this.addLog(`${p.name} trained a ${CONFIG.UNITS[unitType].name}.`, 'build');
    return { ok: true };
  }

  buildFortification(playerId, territoryKey) {
    const p = this.players[playerId];
    const t = this.territories[territoryKey];
    if (!t || t.owner !== playerId) return { ok: false, reason: 'Not your territory.' };
    if (t.fortification >= 4) return { ok: false, reason: 'Max fortification reached.' };
    const cost = { gold: 15, iron: 10 };
    for (const [res, amt] of Object.entries(cost)) {
      if ((p.resources[res] || 0) < amt) return { ok: false, reason: `Not enough ${res}.` };
    }
    for (const [res, amt] of Object.entries(cost)) p.resources[res] -= amt;
    t.fortification++;
    this.addLog(`${p.name} fortified ${territoryKey} (level ${t.fortification}).`, 'build');
    return { ok: true };
  }

  // ── Movement & Combat ─────────────────────────────────────

  canMoveTo(fromKey, toKey, playerId) {
    const dest = this.territories[toKey];
    if (!dest) return false;
    if (!CONFIG.TERRAINS[dest.terrain].passable) return false;
    return true;
  }

  // Get reachable territory keys for a group of units
  getMoveRange(fromKey, unitTypes, playerId) {
    if (!unitTypes || unitTypes.length === 0) return new Map();
    const moveVal = Math.max(...unitTypes.map(t => CONFIG.UNITS[t].move));
    const visited = new Map(); // key → distance
    const queue   = [{ key: fromKey, dist: 0 }];
    visited.set(fromKey, 0);

    while (queue.length) {
      const { key, dist } = queue.shift();
      if (dist >= moveVal) continue;
      for (const nk of (this.adjacency[key] || [])) {
        if (visited.has(nk)) continue;
        const dest = this.territories[nk];
        if (!dest || !CONFIG.TERRAINS[dest.terrain].passable) continue;
        // Can't pass through enemy territory (must attack it)
        const destOwner = dest.owner;
        if (destOwner !== null && destOwner !== playerId &&
            !this.areAllied(playerId, destOwner) && dist < moveVal - 1) {
          // Can enter (to attack) but can't continue beyond
        }
        visited.set(nk, dist + 1);
        queue.push({ key: nk, dist: dist + 1 });
      }
    }
    visited.delete(fromKey);
    return visited;
  }

  areAllied(p1, p2) {
    return this.agreements.some(a =>
      a.type === 'ALLIANCE' && ((a.p1 === p1 && a.p2 === p2) || (a.p1 === p2 && a.p2 === p1))
    );
  }

  hasNAP(p1, p2) {
    return this.agreements.some(a =>
      a.type === 'NAP' && ((a.p1 === p1 && a.p2 === p2) || (a.p1 === p2 && a.p2 === p1))
    );
  }

  moveUnits(playerId, fromKey, toKey, unitIds) {
    const from = this.territories[fromKey];
    const to   = this.territories[toKey];
    if (!from || !to) return { ok: false, reason: 'Invalid territory.' };
    if (!CONFIG.TERRAINS[to.terrain].passable) return { ok: false, reason: 'Impassable terrain.' };

    const movingUnits = from.units.filter(u => unitIds.includes(u.id) && u.owner === playerId);
    if (movingUnits.length === 0) return { ok: false, reason: 'No valid units selected.' };

    const toOwner = to.owner;
    const isEnemy = toOwner !== null && toOwner !== playerId && !this.areAllied(playerId, toOwner);
    const isNeutral = toOwner === null;

    if (isEnemy && this.hasNAP(playerId, toOwner)) {
      // Breaking NAP
      this.breakAgreementWith(playerId, toOwner);
    }

    if (isEnemy) {
      // Combat!
      return this.resolveCombat(playerId, fromKey, toKey, movingUnits);
    } else {
      // Peaceful move
      from.units = from.units.filter(u => !unitIds.includes(u.id));
      to.units.push(...movingUnits);
      if (isNeutral) {
        to.owner = playerId;
        this.addLog(`${this.players[playerId].name} captured ${toKey}.`, 'capture');
      }
      return { ok: true, combat: false };
    }
  }

  resolveCombat(attackerId, fromKey, toKey, attackingUnits) {
    const p    = this.players[attackerId];
    const defender = this.territories[toKey];
    const defenderId = defender.owner;

    const atkBonus = p.bonuses.attack   || 0;
    const defBonus = (defenderId !== null ? this.players[defenderId].bonuses.defense : 0) || 0;

    let atkStrength = attackingUnits.reduce((sum, u) => sum + CONFIG.UNITS[u.type].attack + atkBonus, 0);
    let defStrength = defender.units.reduce((sum, u) => {
      const base = CONFIG.UNITS[u.type].defense + defBonus;
      const terrBonus = CONFIG.TERRAINS[defender.terrain].defBonus;
      const fortBonus = defender.fortification * 2;
      return sum + base + terrBonus + fortBonus;
    }, 0);

    // Artillery in adjacent tile can assist (ranged support)
    const atkTerr = this.territories[fromKey];
    const rangedSupport = atkTerr.units.filter(u => u.owner === attackerId && u.type === 'ARTILLERY' && !attackingUnits.find(a => a.id === u.id));
    atkStrength += rangedSupport.reduce((s, u) => s + CONFIG.UNITS['ARTILLERY'].attack + atkBonus, 0);

    // Siege engine bonus
    const siegeUnits = attackingUnits.filter(u => u.type === 'SIEGE');
    if (siegeUnits.length > 0 && defender.fortification > 0) {
      atkStrength += siegeUnits.length * CONFIG.UNITS['SIEGE'].siegeBonus;
    }

    // If no defenders, free capture
    if (defender.units.length === 0) {
      const from = this.territories[fromKey];
      from.units = from.units.filter(u => !attackingUnits.find(a => a.id === u.id));
      defender.units.push(...attackingUnits);
      const prevOwner = defender.owner;
      defender.owner = attackerId;
      if (prevOwner !== null) {
        const pd = this.players[prevOwner];
        const hasTerr = this.getPlayerTerritories(prevOwner).length;
        if (hasTerr === 0) {
          pd.isAlive = false;
          this.addLog(`${pd.name} has been eliminated!`, 'elimination');
        }
      }
      return { ok: true, combat: true, attWon: true, atkStr: atkStrength, defStr: 0, atkLoss: 0, defLoss: 0 };
    }

    const attWon = atkStrength > defStrength;
    const atkLoss = attWon
      ? Math.max(0, Math.ceil(defStrength * 0.35))
      : Math.ceil(attackingUnits.length * 0.6);
    const defLoss = attWon
      ? defender.units.length
      : Math.max(0, Math.ceil(defender.units.length * 0.3));

    const logMsg = `${p.name} attacked ${toKey}: ATK ${atkStrength} vs DEF ${defStrength}. ` +
                   (attWon ? `ATTACKER WINS!` : `DEFENDER HOLDS.`) +
                   ` Losses — ATK: ${atkLoss}, DEF: ${defLoss}`;
    this.addLog(logMsg, attWon ? 'combat-win' : 'combat-loss');

    // Apply losses
    if (attWon) {
      defender.units = [];
      const from = this.territories[fromKey];
      const survivors = [...attackingUnits];
      for (let i = 0; i < atkLoss && survivors.length; i++) {
        // Remove weakest first (lowest attack)
        survivors.sort((a,b) => CONFIG.UNITS[a.type].attack - CONFIG.UNITS[b.type].attack);
        survivors.shift();
      }
      from.units = from.units.filter(u => !attackingUnits.find(a => a.id === u.id));
      defender.units.push(...survivors);
      const prevOwner = defender.owner;
      defender.owner = attackerId;
      defender.fortification = Math.max(0, defender.fortification - 1); // sieges damage fortifications

      if (prevOwner !== null) {
        const pd = this.players[prevOwner];
        if (this.getPlayerTerritories(prevOwner).length === 0) {
          pd.isAlive = false;
          this.addLog(`${pd.name} has been eliminated!`, 'elimination');
        }
      }
    } else {
      // Attacker repelled
      const from = this.territories[fromKey];
      const survivors = [...attackingUnits];
      for (let i = 0; i < atkLoss && survivors.length; i++) {
        survivors.sort((a,b) => CONFIG.UNITS[a.type].attack - CONFIG.UNITS[b.type].attack);
        survivors.shift();
      }
      // Units that survived return to source
      from.units = from.units.filter(u => !attackingUnits.find(a => a.id === u.id));
      from.units.push(...survivors);

      // Defender losses
      const defSorted = [...defender.units].sort((a,b) => CONFIG.UNITS[a.type].defense - CONFIG.UNITS[b.type].defense);
      const defSurvivors = defSorted.slice(defLoss);
      defender.units = defSurvivors;
    }

    return { ok: true, combat: true, attWon, atkStr: atkStrength, defStr: defStrength, atkLoss, defLoss };
  }

  // ── Technology ────────────────────────────────────────────

  canResearch(playerId, techId) {
    const p = this.players[playerId];
    const tech = CONFIG.TECHS[techId];
    if (!tech) return false;
    if (p.techs.includes(techId)) return false;
    for (const [res, amt] of Object.entries(tech.cost)) {
      if ((p.resources[res] || 0) < amt) return false;
    }
    for (const req of tech.requires) {
      if (!p.techs.includes(req)) return false;
    }
    return true;
  }

  researchTech(playerId, techId) {
    if (!this.canResearch(playerId, techId)) return { ok: false, reason: 'Cannot research.' };
    const p = this.players[playerId];
    const tech = CONFIG.TECHS[techId];
    const dualResearch = p.bonuses.dualResearch;
    if (!dualResearch && this.techResearchedThisTurn >= 1) {
      return { ok: false, reason: 'Can only research 1 tech per turn (need Universities for 2).' };
    }
    for (const [res, amt] of Object.entries(tech.cost)) p.resources[res] -= amt;
    p.techs.push(techId);
    tech.apply(p);
    this.techResearchedThisTurn++;
    this.addLog(`${p.name} researched ${tech.name}!`, 'tech');
    return { ok: true };
  }

  // ── Diplomacy ─────────────────────────────────────────────

  maxAgreements(playerId) {
    return this.players[playerId].bonuses.maxAgreements || 2;
  }

  activeAgreementsFor(playerId) {
    return this.agreements.filter(a => a.p1 === playerId || a.p2 === playerId);
  }

  proposeAgreement(fromId, toId, type) {
    if (fromId === toId) return { ok: false, reason: 'Cannot propose to yourself.' };
    if (!this.players[toId] || !this.players[toId].isAlive) return { ok: false, reason: 'Invalid player.' };
    // Check existing
    const existing = this.agreements.find(a =>
      a.type === type && ((a.p1===fromId&&a.p2===toId)||(a.p1===toId&&a.p2===fromId))
    );
    if (existing) return { ok: false, reason: 'Agreement already exists.' };
    if (this.activeAgreementsFor(fromId).length >= this.maxAgreements(fromId)) {
      return { ok: false, reason: 'Agreement limit reached.' };
    }
    // Check for existing proposal
    const dup = this.proposals.find(pr =>
      pr.type === type && pr.from === fromId && pr.to === toId
    );
    if (dup) return { ok: false, reason: 'Proposal already pending.' };

    this.proposals.push({ id: `prop_${Date.now()}_${Math.random()}`, type, from: fromId, to: toId });
    this.addLog(`${this.players[fromId].name} proposes a ${CONFIG.AGREEMENTS[type].name} to ${this.players[toId].name}.`, 'diplomacy');
    return { ok: true };
  }

  acceptAgreement(proposalId, acceptingId) {
    const propIdx = this.proposals.findIndex(p => p.id === proposalId && p.to === acceptingId);
    if (propIdx === -1) return { ok: false, reason: 'Proposal not found.' };
    const prop = this.proposals[propIdx];
    if (this.activeAgreementsFor(prop.from).length >= this.maxAgreements(prop.from)) {
      this.proposals.splice(propIdx, 1);
      return { ok: false, reason: `${this.players[prop.from].name} is at their agreement limit.` };
    }
    if (this.activeAgreementsFor(acceptingId).length >= this.maxAgreements(acceptingId)) {
      return { ok: false, reason: 'You are at your agreement limit.' };
    }

    const config = CONFIG.AGREEMENTS[prop.type];
    const agreement = {
      id: `agr_${Date.now()}`,
      type:   prop.type,
      p1:     prop.from,
      p2:     acceptingId,
      turnsLeft: config.duration,
      turnCreated: this.turn,
    };
    this.agreements.push(agreement);
    this.proposals.splice(propIdx, 1);
    this.addLog(`${this.players[prop.from].name} and ${this.players[acceptingId].name} signed a ${config.name}!`, 'diplomacy');
    return { ok: true, agreement };
  }

  rejectProposal(proposalId, rejectingId) {
    const idx = this.proposals.findIndex(p => p.id === proposalId && p.to === rejectingId);
    if (idx === -1) return;
    this.proposals.splice(idx, 1);
  }

  breakAgreementWith(breakerId, otherId) {
    const idx = this.agreements.findIndex(a =>
      (a.p1===breakerId&&a.p2===otherId)||(a.p1===otherId&&a.p2===breakerId)
    );
    if (idx !== -1) {
      const a = this.agreements[idx];
      const repLoss = CONFIG.AGREEMENTS[a.type].repLoss;
      const p = this.players[breakerId];
      const repActualLoss = p.bonuses.repProtection ? Math.floor(repLoss * 0.7) : repLoss;
      p.reputation = Math.max(0, p.reputation - repActualLoss);
      this.agreements.splice(idx, 1);
      this.addLog(`${p.name} BROKE their ${CONFIG.AGREEMENTS[a.type].name} with ${this.players[otherId].name}! Rep -${repActualLoss}.`, 'betrayal');
    }
  }

  breakAgreementById(playerId, agreementId) {
    const a = this.agreements.find(ag => ag.id === agreementId);
    if (!a) return { ok: false, reason: 'Agreement not found.' };
    if (a.p1 !== playerId && a.p2 !== playerId) return { ok: false, reason: 'Not your agreement.' };
    const otherId = a.p1 === playerId ? a.p2 : a.p1;
    this.breakAgreementWith(playerId, otherId);
    return { ok: true };
  }

  // ── Propaganda ────────────────────────────────────────────
  usePropaganda(playerId, targetTerrKey) {
    const p = this.players[playerId];
    if (!p.bonuses.propaganda) return { ok: false, reason: 'No propaganda tech.' };
    if ((p.bonuses.propagandaCooldown || 0) > 0) return { ok: false, reason: `Propaganda on cooldown (${p.bonuses.propagandaCooldown} turns).` };
    const t = this.territories[targetTerrKey];
    if (!t) return { ok: false, reason: 'Invalid territory.' };
    // Must be adjacent to a territory you own
    const isAdjacent = (this.adjacency[targetTerrKey] || []).some(nk => this.territories[nk].owner === playerId);
    if (!isAdjacent) return { ok: false, reason: 'Must be adjacent to your territory.' };
    const enemyUnit = t.units.find(u => u.owner !== playerId);
    if (!enemyUnit) return { ok: false, reason: 'No enemy units to convert.' };
    enemyUnit.owner = playerId;
    p.bonuses.propagandaCooldown = 5;
    this.addLog(`${p.name}'s propaganda converts an enemy unit in ${targetTerrKey}!`, 'diplomacy');
    return { ok: true };
  }

  // ── Victory Check ─────────────────────────────────────────

  checkVictory() {
    const totalPassable = Object.values(this.territories)
      .filter(t => CONFIG.TERRAINS[t.terrain].passable).length;

    for (const p of this.players) {
      if (!p.isAlive) continue;
      const myTerr = this.getPlayerTerritories(p.id);
      const myPassable = myTerr.filter(t => CONFIG.TERRAINS[t.terrain].passable).length;

      // Military victory: 55% of passable territories
      if (myPassable / totalPassable >= 0.55) {
        return { playerId: p.id, type: 'MILITARY', desc: 'Military Domination' };
      }

      // Economic victory: 400+ gold AND 2+ cities
      const myCities = myTerr.filter(t => t.terrain === 'CITY' || t.terrain === 'CAPITAL').length;
      if (p.resources.gold >= 400 && myCities >= 2) {
        return { playerId: p.id, type: 'ECONOMIC', desc: 'Economic Supremacy' };
      }

      // Knowledge victory: 8+ techs (or effective count with bonus)
      const effectiveTechs = p.techs.length + (p.bonuses.extraTechs || 0);
      if (effectiveTechs >= 8) {
        return { playerId: p.id, type: 'KNOWLEDGE', desc: 'Enlightenment Victory' };
      }
    }

    // Diplomatic victory: have alliances covering >50% of remaining players, AND have most territory among allied group
    for (const p of this.players) {
      if (!p.isAlive) continue;
      const alliedPlayerIds = new Set([p.id]);
      for (const a of this.agreements.filter(ag => ag.type === 'ALLIANCE')) {
        if (a.p1 === p.id) alliedPlayerIds.add(a.p2);
        if (a.p2 === p.id) alliedPlayerIds.add(a.p1);
      }
      const alivePlayers = this.players.filter(pl => pl.isAlive).length;
      if (alliedPlayerIds.size / alivePlayers > 0.5) {
        const myTerr = this.getPlayerTerritories(p.id).length;
        const maxAllyTerr = Math.max(...[...alliedPlayerIds].map(id => this.getPlayerTerritories(id).length));
        if (myTerr === maxAllyTerr) {
          return { playerId: p.id, type: 'DIPLOMATIC', desc: 'Diplomatic Hegemony' };
        }
      }
    }

    // Last player standing
    const alive = this.players.filter(p => p.isAlive);
    if (alive.length === 1) {
      return { playerId: alive[0].id, type: 'SURVIVAL', desc: 'Last Standing' };
    }

    // Turn limit
    if (this.turn > CONFIG.MAX_TURNS) {
      const scores = this.players
        .filter(p => p.isAlive)
        .map(p => ({
          id: p.id,
          score: this.getPlayerTerritories(p.id).length * 2 + p.resources.gold / 20 + p.techs.length * 3,
        }))
        .sort((a, b) => b.score - a.score);
      return { playerId: scores[0].id, type: 'SCORE', desc: 'Score Victory (Turn Limit)' };
    }

    return null;
  }

  // ── Turn Management ───────────────────────────────────────

  startPlayerTurn() {
    this.techResearchedThisTurn = 0;
    this.phase = 'DIPLOMACY';
    const p = this.players[this.currentPIdx];
    if (!p || !p.isAlive) { this.endPlayerTurn(); return; }

    const income = this.collectResources(this.currentPIdx);

    // Tick agreements
    if (this.currentPIdx === 0) {
      for (let i = this.agreements.length - 1; i >= 0; i--) {
        const a = this.agreements[i];
        if (a.turnsLeft > 0) {
          a.turnsLeft--;
          if (a.turnsLeft === 0) {
            this.addLog(`The ${CONFIG.AGREEMENTS[a.type].name} between ${this.players[a.p1].name} and ${this.players[a.p2].name} has expired.`, 'diplomacy');
            this.agreements.splice(i, 1);
          }
        }
      }
      // Tick propaganda cooldowns
      for (const pl of this.players) {
        if (pl.bonuses.propagandaCooldown > 0) pl.bonuses.propagandaCooldown--;
      }
    }

    const v = this.checkVictory();
    if (v) { this.victory = v; return; }
  }

  advancePhase() {
    if (this.phase === 'DIPLOMACY') { this.phase = 'BUILD'; return; }
    if (this.phase === 'BUILD')     { this.phase = 'MOVE';  return; }
    if (this.phase === 'MOVE')      { this.endPlayerTurn(); return; }
  }

  endPlayerTurn() {
    // Move to next living player
    let nextIdx = (this.currentPIdx + 1) % this.players.length;
    let loops = 0;
    while (!this.players[nextIdx].isAlive) {
      nextIdx = (nextIdx + 1) % this.players.length;
      if (++loops > this.players.length) break;
    }
    if (nextIdx <= this.currentPIdx) this.turn++;
    this.currentPIdx = nextIdx;
    this.startPlayerTurn();
  }

  addLog(msg, type = 'info') {
    this.log.unshift({ msg, type, turn: this.turn });
    if (this.log.length > 80) this.log.pop();
  }

  // ── Serialize for AI ──────────────────────────────────────
  getSnapshot() {
    return {
      turn: this.turn,
      players: this.players.map(p => ({
        id: p.id, name: p.name, isAlive: p.isAlive, reputation: p.reputation,
        resources: { ...p.resources }, techs: [...p.techs], bonuses: { ...p.bonuses },
        terrCount: this.getPlayerTerritories(p.id).length,
        unitCount: this.getPlayerUnits(p.id).length,
      })),
      agreements: this.agreements.map(a => ({ ...a })),
    };
  }
}
