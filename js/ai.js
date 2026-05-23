'use strict';

// ============================================================
// THE REPUBLIC — AI Player
// ============================================================

class AIPlayer {
  constructor(playerId, personality) {
    this.playerId    = playerId;
    this.personality = CONFIG.AI_PERSONALITIES[personality] || CONFIG.AI_PERSONALITIES.SCHEMER;
    this.memory      = {};
  }

  async takeTurn(gs, onAction) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const act   = async (msg) => { onAction && onAction(msg); await delay(120); };

    await this._doDiplomacy(gs, act);
    gs.advancePhase();

    await this._doBuild(gs, act);
    gs.advancePhase();

    await this._doMarch(gs, act);
  }

  async _doDiplomacy(gs, act) {
    const pid = this.playerId;
    const p   = gs.players[pid];

    const pending = gs.getPendingCoalitions(pid);
    for (const { coalition: c, idx } of pending) {
      const theirEV = gs.getEV(c.p1);
      const myEV    = gs.getEV(pid);
      const accept  = theirEV < CONFIG.EV_WIN * 0.7 && myEV < CONFIG.EV_WIN * 0.8;
      if (accept) {
        gs.acceptCoalition(idx);
        await act(`${p.name} accepts coalition.`);
      } else {
        c.pending = false;
      }
    }

    for (const c of gs.getActiveCoalitions(pid)) {
      const partnerId = c.p1 === pid ? c.p2 : c.p1;
      if (gs.getEV(partnerId) >= CONFIG.EV_WIN * 0.65 && this.personality.weights.attack > 0.5) {
        gs.breakCoalition(gs.coalitions.indexOf(c), pid);
        await act(`${p.name} breaks coalition — partner too powerful!`);
        break;
      }
    }

    if (gs.getActiveCoalitions(pid).length < 2) {
      const candidates = gs.players.filter(pp =>
        pp.id !== pid && pp.alive && !gs.areAllied(pid, pp.id) && gs.getEV(pp.id) < CONFIG.EV_WIN * 0.6
      );
      if (candidates.length > 0) {
        const type = this.personality.weights.money > 0.6 ? 'FUNDING_PACT' : 'NON_COMPETE';
        gs.proposeCoalition(type, pid, candidates[0].id);
        await act(`${p.name} proposes ${type} with ${candidates[0].name}.`);
      }
    }
  }

  async _doBuild(gs, act) {
    const pid = this.playerId;
    const p   = gs.players[pid];
    const w   = this.personality.weights;

    await this._doResearch(gs, act);

    const myStates = Object.values(gs.territories).filter(t => t.owner === pid);
    let opPriority = ['OPERATIVE', 'GRASSROOTS', 'MEDIA_TEAM', 'DARK_MONEY', 'OPP_RESEARCH', 'POWER_BROKER'];
    if (w.attack > 0.6) opPriority = ['POWER_BROKER', 'DARK_MONEY', 'OPERATIVE', 'MEDIA_TEAM', 'OPP_RESEARCH', 'GRASSROOTS'];
    if (w.media  > 0.7) opPriority = ['MEDIA_TEAM', 'OPP_RESEARCH', 'OPERATIVE', 'DARK_MONEY', 'GRASSROOTS', 'POWER_BROKER'];
    if (w.money  > 0.7) opPriority = ['OPERATIVE', 'MEDIA_TEAM', 'DARK_MONEY', 'GRASSROOTS', 'OPP_RESEARCH', 'POWER_BROKER'];

    for (const t of myStates) {
      for (const opType of opPriority) {
        const chk = gs.canDeploy(pid, t.abbr, opType);
        if (chk.ok) {
          gs.deployOp(pid, t.abbr, opType);
          await act(`${p.name} deploys ${CONFIG.OPERATIONS[opType].name} in ${t.abbr}.`);
          break;
        }
      }
    }

    if (w.defend > 0.5) {
      for (const t of myStates) {
        const isBorder = (ADJACENCY[t.abbr] || []).some(nb => {
          const nbT = gs.territories[nb];
          return nbT && nbT.owner !== pid && nbT.owner !== null;
        });
        if (isBorder && t.entrenched < 2) {
          const res = gs.entrenchState(pid, t.abbr);
          if (res.ok) { await act(`${p.name} entrenches ${t.abbr}.`); break; }
        }
      }
    }
  }

  async _doResearch(gs, act) {
    const pid = this.playerId;
    const w   = this.personality.weights;
    let branches = ['Digital', 'Populist', 'Dark Arts', 'Coalition'];
    if (w.media  > 0.6) branches = ['Digital', 'Dark Arts', 'Coalition', 'Populist'];
    if (w.money  > 0.6) branches = ['Coalition', 'Digital', 'Populist', 'Dark Arts'];
    if (w.attack > 0.6) branches = ['Dark Arts', 'Populist', 'Digital', 'Coalition'];

    for (const branch of branches) {
      for (const [key, def] of Object.entries(CONFIG.POLICIES)) {
        if (def.branch !== branch) continue;
        const chk = gs.canResearch(pid, key);
        if (chk.ok) {
          gs.researchPolicy(pid, key);
          await act(`${gs.players[pid].name} passed: ${def.name}.`);
          return;
        }
      }
    }
  }

  async _doMarch(gs, act) {
    const pid      = this.playerId;
    const p        = gs.players[pid];
    const myStates = Object.values(gs.territories).filter(t => t.owner === pid);

    for (const t of myStates) {
      const myOps = t.ops.filter(op => op.owner === pid && !op.moved);
      if (myOps.length === 0) continue;

      const opTypes = [...new Set(myOps.map(op => op.type))];
      const range   = gs.getMoveRange(t.abbr, opTypes, pid);
      const target  = this._pickTarget(gs, pid, range);
      if (!target) continue;

      const result = gs.moveOps(t.abbr, target, pid, opTypes);
      if (result.ok) {
        await act(result.captured ? `${p.name} SEIZED ${target}!` : `${p.name} moved ops to ${target}.`);
      }
    }
  }

  _pickTarget(gs, pid, range) {
    if (range.size === 0) return null;
    const w = this.personality.weights;
    let best = null, bestScore = -Infinity;

    for (const [abbr] of range) {
      const t = gs.territories[abbr];
      if (!t) continue;
      let score = 0;

      if (t.owner === null) {
        score += t.ev * 3 + 5;
      } else if (t.owner !== pid && !gs.areAllied(pid, t.owner)) {
        const myStr  = this._getAtkStr(gs, pid, abbr);
        const defStr = t.ops.filter(op => op.owner === t.owner)
          .reduce((s, op) => s + CONFIG.OPERATIONS[op.type].defense, 0)
          + CONFIG.STATE_TYPES[t.lean].defBonus + t.entrenched * 2;
        if (myStr <= defStr * 0.9) continue;
        score += t.ev * 5 * w.attack + (myStr - defStr) * 2;
      } else if (t.owner === pid) {
        score += 1;
      } else {
        continue;
      }
      score += t.ev * w.expand;

      if (score > bestScore) { bestScore = score; best = abbr; }
    }
    return best;
  }

  _getAtkStr(gs, pid, targetAbbr) {
    let str = 0;
    for (const t of Object.values(gs.territories)) {
      if (t.owner !== pid) continue;
      const myOps = t.ops.filter(op => op.owner === pid && !op.moved);
      if (myOps.length === 0) continue;
      const opTypes = [...new Set(myOps.map(op => op.type))];
      const range   = gs.getMoveRange(t.abbr, opTypes, pid);
      if (range.has(targetAbbr)) {
        str += myOps.reduce((s, op) => s + CONFIG.OPERATIONS[op.type].attack, 0);
      }
    }
    return str;
  }
}
