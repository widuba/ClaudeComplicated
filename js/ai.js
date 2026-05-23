'use strict';

// ============================================================
// GRAND DOMINION — AI Player Logic
// AI personalities: Conqueror, Merchant, Scholar, Diplomat, Opportunist
// ============================================================

class AIPlayer {
  constructor(playerId, personalityId) {
    this.playerId     = playerId;
    this.personality  = CONFIG.AI_PERSONALITIES.find(p => p.id === personalityId) || CONFIG.AI_PERSONALITIES[4];
    this.memory       = {};   // remembers who betrayed them
    this.lastTargetId = null;
  }

  // Called when it's the AI's turn. Returns a promise that resolves after all actions.
  async takeTurn(gs, onAction) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Diplomacy phase
    gs.phase = 'DIPLOMACY';
    await this._doDiplomacy(gs, onAction);
    await delay(200);

    // 2. Build phase
    gs.phase = 'BUILD';
    await this._doBuild(gs, onAction);
    await delay(200);

    // 3. Move phase
    gs.phase = 'MOVE';
    await this._doMove(gs, onAction);
    await delay(200);

    if (onAction) onAction('END_TURN');
  }

  // ── Diplomacy ─────────────────────────────────────────────

  async _doDiplomacy(gs, onAction) {
    const p = gs.players[this.playerId];
    if (!p.isAlive) return;

    // Accept or reject incoming proposals
    const incoming = gs.proposals.filter(pr => pr.to === this.playerId);
    for (const prop of incoming) {
      const accept = this._shouldAcceptProposal(gs, prop);
      if (accept) {
        gs.acceptAgreement(prop.id, this.playerId);
        if (onAction) onAction('AGREEMENT_ACCEPTED', prop);
      } else {
        gs.rejectProposal(prop.id, this.playerId);
      }
    }

    // Consider breaking agreements that are no longer beneficial
    const myAgreements = gs.agreements.filter(a => a.p1 === this.playerId || a.p2 === this.playerId);
    for (const a of myAgreements) {
      if (this._shouldBreakAgreement(gs, a)) {
        const otherId = a.p1 === this.playerId ? a.p2 : a.p1;
        gs.breakAgreementWith(this.playerId, otherId);
        this.memory[otherId] = (this.memory[otherId] || 0) - 5; // tarnish their standing in our eyes
        if (onAction) onAction('BETRAYAL', { playerId: this.playerId, otherId });
        break; // One betrayal per turn is enough
      }
    }

    // Consider proposing new agreements
    const w = this.personality.weights;
    if ((w.diplomacy > 0.25) && gs.activeAgreementsFor(this.playerId).length < gs.maxAgreements(this.playerId)) {
      const target = this._chooseDiplomacyTarget(gs);
      if (target !== null) {
        const type = this._chooseAgreementType(gs, target);
        if (type) gs.proposeAgreement(this.playerId, target, type);
      }
    }

    // Consider propaganda if available
    if (p.bonuses.propaganda && (p.bonuses.propagandaCooldown || 0) === 0) {
      const target = this._choosePropagandaTarget(gs);
      if (target) gs.usePropaganda(this.playerId, target);
    }
  }

  _shouldAcceptProposal(gs, prop) {
    const p   = gs.players[this.playerId];
    const from = gs.players[prop.from];
    // Don't ally with the dominant player (dangerous)
    const snap = gs.getSnapshot();
    const maxTerr = Math.max(...snap.players.filter(pl=>pl.isAlive).map(pl=>pl.terrCount));
    if (snap.players[prop.from].terrCount === maxTerr && maxTerr > snap.players[this.playerId].terrCount * 1.4) {
      return false; // They're too strong, don't help them more
    }
    if (this.memory[prop.from] && this.memory[prop.from] < -10) return false; // Burned before
    // Accept if agreements slot is available and proposer has good rep
    if (from.reputation < 30) return false;
    if (gs.activeAgreementsFor(this.playerId).length >= gs.maxAgreements(this.playerId)) return false;
    const w = this.personality.weights;
    const chance = w.diplomacy * 2.0 + (from.reputation / 100) * 0.5;
    return Math.random() < chance; // Some randomness adds unpredictability
  }

  _shouldBreakAgreement(gs, agreement) {
    const otherId = agreement.p1 === this.playerId ? agreement.p2 : agreement.p1;
    const other   = gs.players[otherId];
    const snap    = gs.getSnapshot();
    const myData  = snap.players[this.playerId];
    const otherData = snap.players[otherId];

    // If the other player is about to win, betray and attack them
    if (otherData.terrCount > snap.players.filter(p=>p.isAlive).reduce((m,p)=>p.terrCount>m?p.terrCount:m,0)*0.8) {
      if (otherData.terrCount > myData.terrCount * 1.5) return true;
    }

    // Diplomat personality is more likely to betray when ahead
    if (this.personality.id === 'DIPLOMAT') {
      if (myData.terrCount > otherData.terrCount * 1.8 && Math.random() < 0.3) return true;
    }

    // Conqueror breaks NAPs to attack weakened neighbors
    if (this.personality.id === 'CONQUEROR' && agreement.type === 'NAP') {
      const otherTerr = gs.getPlayerTerritories(otherId);
      const adjacentToMe = otherTerr.some(t => (gs.adjacency[t.key]||[]).some(nk => gs.territories[nk].owner === this.playerId));
      if (adjacentToMe && other.isAlive && this._canDefeatPlayer(gs, otherId)) return Math.random() < 0.25;
    }

    return false;
  }

  _chooseDiplomacyTarget(gs) {
    const threats = this._rankThreats(gs);
    const me      = gs.players[this.playerId];
    const myTerr  = gs.getPlayerTerritories(this.playerId).length;

    // Target the second-most dangerous player (not the biggest threat, that's a future ally)
    // Actually: target someone who isn't a threat to us but whom we could use against bigger threats
    const potential = gs.players.filter(p =>
      p.isAlive && p.id !== this.playerId &&
      !gs.areAllied(this.playerId, p.id) && !gs.hasNAP(this.playerId, p.id) &&
      p.reputation >= 40 &&
      !this.memory[p.id] || this.memory[p.id] > -8
    );

    if (potential.length === 0) return null;

    // Sort by: close in strength (good partner), not adjacent (won't fight anytime soon)
    potential.sort((a, b) => {
      const aScore = Math.abs(gs.getPlayerTerritories(a.id).length - myTerr);
      const bScore = Math.abs(gs.getPlayerTerritories(b.id).length - myTerr);
      return aScore - bScore;
    });

    return potential[0].id;
  }

  _chooseAgreementType(gs, targetId) {
    const w = this.personality.weights;
    if (w.economy > 0.4) return 'TRADE';
    if (w.military > 0.4) return 'ALLIANCE';
    if (gs.hasNAP(this.playerId, targetId)) return 'TRADE';
    return 'NAP';
  }

  _choosePropagandaTarget(gs) {
    const myTerritories = gs.getPlayerTerritories(this.playerId).map(t => t.key);
    for (const tk of myTerritories) {
      for (const nk of (gs.adjacency[tk] || [])) {
        const nt = gs.territories[nk];
        if (nt && nt.owner !== this.playerId && nt.units.some(u => u.owner !== this.playerId)) {
          return nk;
        }
      }
    }
    return null;
  }

  // ── Build ─────────────────────────────────────────────────

  async _doBuild(gs, onAction) {
    const p    = gs.players[this.playerId];
    if (!p.isAlive) return;
    const w    = this.personality.weights;

    // Research tech if beneficial
    this._doResearch(gs);

    // Determine primary build type based on personality
    const buildPriority = w.military > 0.4 ? ['CAVALRY','INFANTRY','ARTILLERY','SIEGE']
                        : w.economy  > 0.4 ? ['INFANTRY','CAVALRY','INFANTRY']
                        : ['INFANTRY','CAVALRY','ARTILLERY'];

    // Find best build location (capital or closest city to frontline)
    const myCapital = this._getCapital(gs);
    const buildLocs = gs.getPlayerTerritories(this.playerId)
      .filter(t => CONFIG.TERRAINS[t.terrain].passable)
      .sort((a, b) => (a.terrain === 'CAPITAL' ? -1 : 1)); // capitals first

    let builtCount = 0;
    const maxBuild = 3;

    for (const type of buildPriority) {
      if (builtCount >= maxBuild) break;
      for (const t of buildLocs) {
        if (builtCount >= maxBuild) break;
        const result = gs.buildUnit(this.playerId, t.key, type);
        if (result.ok) {
          builtCount++;
          if (onAction) onAction('BUILD', { type, key: t.key });
        }
      }
    }

    // Consider fortifying exposed territories
    if (w.military > 0.3 || w.economy > 0.3) {
      const frontline = this._getFrontlineTerritories(gs);
      for (const t of frontline.slice(0, 2)) {
        if (t.fortification < 3) {
          gs.buildFortification(this.playerId, t.key);
        }
      }
    }
  }

  _doResearch(gs) {
    const p = gs.players[this.playerId];
    const w = this.personality.weights;

    // Priority order based on personality
    const techPriority = {
      CONQUEROR:   ['STEEL_WEAPONS','WAR_DOCTRINE','IMPERIAL_LEGIONS','AGRICULTURE','LIBRARIES','ENVOYS'],
      MERCHANT:    ['AGRICULTURE','TRADE_ROUTES','INDUSTRIALIZATION','LIBRARIES','ENVOYS','UNIVERSITIES'],
      SCHOLAR:     ['LIBRARIES','UNIVERSITIES','GRAND_PHILOSOPHY','AGRICULTURE','ENVOYS','STEEL_WEAPONS'],
      DIPLOMAT:    ['AMBASSADORS','SPY_NETWORK','LIBRARIES','AGRICULTURE','STEEL_WEAPONS','PROPAGANDA'],
      OPPORTUNIST: ['STEEL_WEAPONS','AGRICULTURE','LIBRARIES','AMBASSADORS','TRADE_ROUTES','WAR_DOCTRINE'],
    }[this.personality.id] || [];

    for (const techId of techPriority) {
      if (gs.canResearch(this.playerId, techId)) {
        gs.researchTech(this.playerId, techId);
        break;
      }
    }
  }

  _getCapital(gs) {
    return gs.getPlayerTerritories(this.playerId).find(t => t.terrain === 'CAPITAL');
  }

  _getFrontlineTerritories(gs) {
    return gs.getPlayerTerritories(this.playerId).filter(t => {
      return (gs.adjacency[t.key] || []).some(nk => {
        const nt = gs.territories[nk];
        return nt && nt.owner !== null && nt.owner !== this.playerId && !gs.areAllied(this.playerId, nt.owner);
      });
    });
  }

  // ── Move ──────────────────────────────────────────────────

  async _doMove(gs, onAction) {
    const p = gs.players[this.playerId];
    if (!p.isAlive) return;

    const target  = this._pickAttackTarget(gs);
    const snap    = gs.getSnapshot();
    const myTerr  = snap.players[this.playerId].terrCount;

    // Consolidate if weak; attack if strong enough
    const myUnits = gs.getPlayerUnits(this.playerId);
    if (myUnits.length === 0) return;

    // Group units by territory
    const unitsByTerr = {};
    for (const u of myUnits) {
      if (!unitsByTerr[u.territory]) unitsByTerr[u.territory] = [];
      unitsByTerr[u.territory].push(u);
    }

    let movesLeft = 3; // max moves per turn to keep AI from overwhelming

    // For each territory with units, decide action
    for (const [fromKey, units] of Object.entries(unitsByTerr)) {
      if (movesLeft <= 0) break;
      const from = gs.territories[fromKey];

      // Find attack target adjacent
      const attackTarget = this._findBestAttackFromTerritory(gs, fromKey, units, target);
      if (attackTarget) {
        const unitIds = units.map(u => u.id);
        const result  = gs.moveUnits(this.playerId, fromKey, attackTarget, unitIds);
        if (result.ok) {
          if (onAction) onAction('MOVE', { from: fromKey, to: attackTarget, combat: result.combat });
          movesLeft--;
          continue;
        }
      }

      // Move towards target if no adjacent attack
      if (target !== null && movesLeft > 0) {
        const moveTarget = this._findStepTowards(gs, fromKey, target, units);
        if (moveTarget && moveTarget !== fromKey) {
          const unitIds = units.slice(0, Math.ceil(units.length * 0.7)).map(u => u.id); // move 70% of stack
          const result  = gs.moveUnits(this.playerId, fromKey, moveTarget, unitIds);
          if (result.ok) {
            if (onAction) onAction('MOVE', { from: fromKey, to: moveTarget, combat: false });
            movesLeft--;
          }
        }
      }
    }
  }

  _pickAttackTarget(gs) {
    const snap = gs.getSnapshot();
    const me   = snap.players[this.playerId];
    const w    = this.personality.weights;

    // Never target allies unless betrayal decided
    const candidates = gs.players.filter(p =>
      p.isAlive && p.id !== this.playerId && !gs.areAllied(this.playerId, p.id)
    );

    if (candidates.length === 0) return null;

    // Score each candidate
    const scored = candidates.map(c => {
      const data   = snap.players[c.id];
      const terr   = gs.getPlayerTerritories(c.id);
      const isAdj  = terr.some(t =>
        (gs.adjacency[t.key]||[]).some(nk => gs.territories[nk].owner === this.playerId)
      );

      let score = 0;
      score += isAdj ? 50 : 0;                         // Prefer adjacent
      score += (10 - data.terrCount) * 3;              // Prefer weaker players
      score += (100 - c.reputation) * 0.2;             // Prefer untrustworthy (they're a threat)
      score += (this.memory[c.id] || 0) * 2;           // Favor enemies we already hate
      if (this.personality.id === 'CONQUEROR') score += data.terrCount * 0.5; // Conqueror goes for big targets
      return { id: c.id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    this.lastTargetId = scored[0].id;
    return scored[0].id;
  }

  _findBestAttackFromTerritory(gs, fromKey, units, preferredTargetId) {
    const adj = (gs.adjacency[fromKey] || []);
    let best  = null, bestScore = -Infinity;

    for (const nk of adj) {
      const nt = gs.territories[nk];
      if (!nt || !CONFIG.TERRAINS[nt.terrain].passable) continue;
      if (nt.owner === this.playerId) continue;
      if (nt.owner !== null && gs.areAllied(this.playerId, nt.owner)) continue;
      if (nt.owner !== null && gs.hasNAP(this.playerId, nt.owner)) continue; // Don't break NAP casually

      // Calculate combat odds
      const atkStr = units.reduce((s, u) => s + CONFIG.UNITS[u.type].attack + (gs.players[this.playerId].bonuses.attack || 0), 0);
      const defStr = nt.units.reduce((s, u) => s + CONFIG.UNITS[u.type].defense + CONFIG.TERRAINS[nt.terrain].defBonus + nt.fortification * 2 + (nt.owner !== null ? gs.players[nt.owner].bonuses.defense || 0 : 0), 0);

      if (atkStr <= defStr * 0.9) continue; // Won't attack if odds are too bad

      let score = atkStr - defStr;
      if (nt.owner === preferredTargetId) score += 30;
      if (nt.terrain === 'CITY' || nt.terrain === 'CAPITAL' || nt.terrain === 'ANCIENT') score += 20;

      if (score > bestScore) { bestScore = score; best = nk; }
    }

    return best;
  }

  _findStepTowards(gs, fromKey, targetPlayerId, units) {
    const targetTerrs = gs.getPlayerTerritories(targetPlayerId);
    if (targetTerrs.length === 0) return null;

    // BFS from fromKey towards nearest enemy territory
    const from = Hex.parseKey(fromKey);
    const nearest = targetTerrs
      .map(t => ({ key: t.key, dist: Hex.dist(from.q, from.r, t.q, t.r) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (!nearest) return null;

    const target = Hex.parseKey(nearest.key);
    const moveVal = Math.max(...units.map(u => CONFIG.UNITS[u.type].move));

    // Step BFS: find the neighbor of fromKey that is closest to target
    const adj = (gs.adjacency[fromKey] || []);
    let bestKey   = null, bestDist = Infinity;

    for (const nk of adj) {
      const nt = gs.territories[nk];
      if (!nt || !CONFIG.TERRAINS[nt.terrain].passable) continue;
      if (nt.owner !== null && nt.owner !== this.playerId && !gs.areAllied(this.playerId, nt.owner)) {
        // Enemy territory — only step into it if we can attack
        continue; // Let _findBestAttackFromTerritory handle attacks
      }
      const nPos = Hex.parseKey(nk);
      const d    = Hex.dist(nPos.q, nPos.r, target.q, target.r);
      if (d < bestDist) { bestDist = d; bestKey = nk; }
    }

    return bestKey;
  }

  _canDefeatPlayer(gs, targetId) {
    const myUnits  = gs.getPlayerUnits(this.playerId);
    const theirUnits = gs.getPlayerUnits(targetId);
    const myStr    = myUnits.reduce((s,u)  => s + CONFIG.UNITS[u.type].attack, 0);
    const theirStr = theirUnits.reduce((s,u) => s + CONFIG.UNITS[u.type].defense, 0);
    return myStr > theirStr * 0.9;
  }

  _rankThreats(gs) {
    return gs.players
      .filter(p => p.isAlive && p.id !== this.playerId)
      .map(p => ({ id: p.id, threat: gs.getPlayerTerritories(p.id).length + gs.getPlayerUnits(p.id).length * 0.5 }))
      .sort((a, b) => b.threat - a.threat);
  }
}
