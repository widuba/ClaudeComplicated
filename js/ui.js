'use strict';

// ============================================================
// GRAND DOMINION — UI Controller
// Wires together game state, renderer, AI, and HTML
// ============================================================

class UIController {
  constructor() {
    this.gs       = new GameState();
    this.renderer = null;
    this.aiPlayers = {};
    this.selectedUnits   = [];  // unit ids chosen for move
    this.awaitingMove    = false;
    this.aiThinking      = false;

    this._initSetupScreen();
  }

  // ── Setup Screen ──────────────────────────────────────────

  _initSetupScreen() {
    const countBtns = document.querySelectorAll('.btn-player-count');
    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        countBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderPlayerList(parseInt(btn.dataset.count));
      });
    });
    this._renderPlayerList(4);

    document.getElementById('btn-start-game').addEventListener('click', () => this._startGame());
  }

  _renderPlayerList(count) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const color = CONFIG.PLAYER_COLORS[i];
      const div   = document.createElement('div');
      div.className = 'player-entry';
      div.innerHTML = `
        <div class="player-color-dot" style="background:${color.primary}"></div>
        <input class="player-name-input" data-idx="${i}" type="text" value="${color.name}" maxlength="24" placeholder="Player name"/>
        <select class="player-type-select" data-idx="${i}">
          <option value="human">Human</option>
          <option value="ai_CONQUEROR">AI: The Conqueror</option>
          <option value="ai_MERCHANT">AI: The Merchant</option>
          <option value="ai_SCHOLAR">AI: The Scholar</option>
          <option value="ai_DIPLOMAT">AI: The Diplomat</option>
          <option value="ai_OPPORTUNIST">AI: The Opportunist</option>
        </select>
      `;
      // Default: first player is Human, rest AI
      if (i > 0) div.querySelector('select').value = 'ai_OPPORTUNIST';
      list.appendChild(div);
    }
  }

  _startGame() {
    const entries = document.querySelectorAll('.player-entry');
    const configs = [];
    entries.forEach((e, i) => {
      const name      = e.querySelector('.player-name-input').value.trim() || CONFIG.PLAYER_COLORS[i].name;
      const typeVal   = e.querySelector('.player-type-select').value;
      const isAI      = typeVal.startsWith('ai_');
      const personality = isAI ? typeVal.replace('ai_', '') : 'OPPORTUNIST';
      configs.push({ name, isAI, personality });
    });

    const numPlayers = configs.length;

    // Init game
    this.gs.init(numPlayers, configs);

    // Create AI players
    this.aiPlayers = {};
    configs.forEach((cfg, i) => {
      if (cfg.isAI) this.aiPlayers[i] = new AIPlayer(i, cfg.personality);
    });

    // Setup canvas
    const canvas = document.getElementById('game-canvas');
    canvas.width  = 800;
    canvas.height = 660;
    this.renderer = new Renderer(canvas);
    this.renderer.setGameState(this.gs);

    // Bind canvas events
    canvas.addEventListener('click', (e) => this._onCanvasClick(e));

    // Bind button events
    document.getElementById('btn-end-phase').addEventListener('click', () => this._endPhase());
    document.getElementById('btn-diplomacy').addEventListener('click', () => this._openDiplomacyModal());
    document.getElementById('btn-tech').addEventListener('click', () => this._openTechModal());
    document.getElementById('btn-build-unit').addEventListener('click', () => this._openBuildModal());
    document.getElementById('btn-fortify').addEventListener('click', () => this._fortifySelected());
    document.getElementById('btn-move-units').addEventListener('click', () => this._startMoveMode());
    document.getElementById('btn-cancel-move').addEventListener('click', () => this._cancelMove());
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this._closeModals());
    });

    // Switch screens
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this._updateUI();
    this._loop();

    // Start AI turn if current player is AI
    this._maybeDoAITurn();
  }

  // ── Game Loop ─────────────────────────────────────────────

  _loop() {
    this.renderer.draw();
    requestAnimationFrame(() => this._loop());
  }

  // ── AI Turn ───────────────────────────────────────────────

  async _maybeDoAITurn() {
    if (this.gs.victory) { this._showVictory(); return; }
    const pidx = this.gs.currentPIdx;
    const p    = this.gs.players[pidx];
    if (!p || !p.isAlive) { this.gs.endPlayerTurn(); this._maybeDoAITurn(); return; }
    if (!p.isAI) return; // Human turn

    this.aiThinking = true;
    this._updateUI();
    document.getElementById('btn-end-phase').disabled = true;

    const ai = this.aiPlayers[pidx];
    if (!ai) {
      this.gs.endPlayerTurn();
      this.aiThinking = false;
      this._afterTurn();
      return;
    }

    await new Promise(r => setTimeout(r, CONFIG.AI_TURN_DELAY_MS));
    await ai.takeTurn(this.gs, (action, data) => {
      this._addLogEntry(this.gs.log[0]);
      this._updateUI();
    });

    // Advance past this AI player's turn
    this.gs.endPlayerTurn();
    this.aiThinking = false;
    this._afterTurn();
  }

  _afterTurn() {
    if (this.gs.victory) { this._showVictory(); return; }
    this._updateUI();
    document.getElementById('btn-end-phase').disabled = false;
    this.renderer.clearSelection();
    this.selectedUnits = [];
    this.awaitingMove  = false;
    this._maybeDoAITurn();
  }

  // ── Phase Management ──────────────────────────────────────

  _endPhase() {
    if (this.aiThinking) return;
    const prevPIdx = this.gs.currentPIdx;
    this.gs.advancePhase();
    this.renderer.clearSelection();
    this.selectedUnits = [];
    this.awaitingMove  = false;
    // If the player advanced (turn ended) or victory triggered, run afterTurn
    if (this.gs.currentPIdx !== prevPIdx || this.gs.victory) {
      this._afterTurn();
    } else {
      this._updateUI();
    }
  }

  // ── Canvas Click ──────────────────────────────────────────
  // Two-click flow: 1st click selects + shows range; 2nd click executes.

  _onCanvasClick(e) {
    if (this.aiThinking) return;
    const rect  = this.renderer.canvas.getBoundingClientRect();
    const px    = e.clientX - rect.left;
    const py    = e.clientY - rect.top;
    const hex   = Hex.fromPixel(px - this.renderer.camera.x, py - this.renderer.camera.y, CONFIG.HEX_SIZE);
    const key   = Hex.key(hex.q, hex.r);
    const t     = this.gs.territories[key];
    if (!t) { this.renderer.clearSelection(); this.awaitingMove = false; this._updateUI(); return; }

    const pidx  = this.gs.currentPIdx;
    const phase = this.gs.phase;

    if (this.awaitingMove) {
      // Re-select a different territory to move from
      if (t.owner === pidx && t.units.filter(u => u.owner === pidx).length > 0
          && !this.renderer.moveable.has(key) && !this.renderer.attackable.has(key)) {
        this._selectTerritoryForMove(key, t, pidx);
        this._updateUI();
        return;
      }
      // Execute move to highlighted destination
      if (this.renderer.moveable.has(key) || this.renderer.attackable.has(key)) {
        this._executeMove(key);
      } else {
        this.renderer.clearSelection();
        this.awaitingMove  = false;
        this.selectedUnits = [];
        this._updateUI();
      }
      return;
    }

    // First click: select and inspect territory
    this.renderer.selectTerritory(key);
    this.selectedUnits = [];
    this._updateTerritoryPanel(t);

    if (phase === 'MOVE' && t.owner === pidx) {
      this._selectTerritoryForMove(key, t, pidx);
    }
    this._updateUI();
  }

  _selectTerritoryForMove(key, t, pidx) {
    const myUnits = t.units.filter(u => u.owner === pidx);
    if (myUnits.length === 0) return;
    this.selectedUnits = myUnits.map(u => u.id);
    const types = [...new Set(myUnits.map(u => u.type))];
    this.renderer.showMoveRange(key, types, pidx);
    this.awaitingMove = true;
  }

  _startMoveMode() {
    if (!this.renderer.selected) return;
    const t = this.gs.territories[this.renderer.selected];
    if (!t || t.owner !== this.gs.currentPIdx) return;
    this._selectTerritoryForMove(this.renderer.selected, t, this.gs.currentPIdx);
    this._updateUI();
  }

  _cancelMove() {
    this.renderer.clearSelection();
    this.awaitingMove  = false;
    this.selectedUnits = [];
    this._updateUI();
  }

  _executeMove(toKey) {
    const fromKey = this.renderer.selected;
    if (!fromKey || this.selectedUnits.length === 0) return;

    const result = this.gs.moveUnits(this.gs.currentPIdx, fromKey, toKey, this.selectedUnits);
    this.renderer.clearSelection();
    this.awaitingMove  = false;
    this.selectedUnits = [];

    if (result.combat) {
      this._showCombatResult(result);
    }
    this._addLogEntry(this.gs.log[0]);
    this._updateUI();

    if (this.gs.victory) this._showVictory();
  }

  _showCombatResult(result) {
    const toast = document.getElementById('combat-toast');
    const cls   = result.attWon ? 'win' : 'loss';
    toast.className = `combat-toast ${cls}`;
    toast.textContent = result.attWon
      ? `⚔ VICTORY! ATK ${result.atkStr} vs DEF ${result.defStr}. Losses: ${result.atkLoss}`
      : `🛡 REPELLED. ATK ${result.atkStr} vs DEF ${result.defStr}. Lost ${result.atkLoss} units.`;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  // ── Fortify ───────────────────────────────────────────────

  _fortifySelected() {
    const key = this.renderer.selected;
    if (!key) { this._showStatus('Select a territory first.'); return; }
    const result = this.gs.buildFortification(this.gs.currentPIdx, key);
    if (!result.ok) { this._showStatus(result.reason); return; }
    this._updateUI();
    this._addLogEntry(this.gs.log[0]);
  }

  // ── Build Modal ───────────────────────────────────────────

  _openBuildModal() {
    const key = this.renderer.selected;
    if (!key) { this._showStatus('Select a territory first.'); return; }
    const t = this.gs.territories[key];
    if (!t || t.owner !== this.gs.currentPIdx) { this._showStatus('Select YOUR territory.'); return; }

    const modal   = document.getElementById('build-modal');
    const content = document.getElementById('build-content');
    const p       = this.gs.players[this.gs.currentPIdx];
    content.innerHTML = '';

    for (const [typeId, unit] of Object.entries(CONFIG.UNITS)) {
      const canAfford = Object.entries(unit.cost).every(([res, amt]) => (p.resources[res] || 0) >= amt);
      const costStr   = Object.entries(unit.cost).map(([r,v]) => `${v} ${r}`).join(', ');
      const div       = document.createElement('div');
      div.className   = `build-option${canAfford ? '' : ' unaffordable'}`;
      div.innerHTML   = `
        <div class="build-icon" style="color:${unit.color}">${unit.icon}</div>
        <div class="build-info">
          <div class="build-name">${unit.name}</div>
          <div class="build-stats">ATK ${unit.attack} | DEF ${unit.defense} | MOV ${unit.move}</div>
          <div class="build-desc">${unit.desc}</div>
          <div class="build-cost">${costStr}</div>
        </div>
        <button class="btn-build-confirm${canAfford ? '' : ' disabled'}" data-type="${typeId}" data-key="${key}">
          ${canAfford ? 'Train' : 'Can\'t Afford'}
        </button>
      `;
      content.appendChild(div);
    }

    content.querySelectorAll('.btn-build-confirm:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = this.gs.buildUnit(this.gs.currentPIdx, btn.dataset.key, btn.dataset.type);
        if (result.ok) {
          this._closeModals();
          this._updateUI();
          this._addLogEntry(this.gs.log[0]);
        } else {
          this._showStatus(result.reason);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  // ── Tech Modal ────────────────────────────────────────────

  _openTechModal() {
    const modal   = document.getElementById('tech-modal');
    const content = document.getElementById('tech-content');
    const p       = this.gs.players[this.gs.currentPIdx];
    content.innerHTML = '';

    const branches = { military: '⚔ Military', economy: '💰 Economy', knowledge: '📚 Knowledge', diplomacy: '🤝 Diplomacy' };

    for (const [branchId, branchName] of Object.entries(branches)) {
      const section = document.createElement('div');
      section.className = 'tech-branch';
      section.innerHTML = `<h3 class="tech-branch-title">${branchName}</h3>`;

      const branchTechs = Object.entries(CONFIG.TECHS)
        .filter(([,t]) => t.branch === branchId)
        .sort((a,b) => a[1].tier - b[1].tier);

      for (const [techId, tech] of branchTechs) {
        const owned    = p.techs.includes(techId);
        const canRes   = this.gs.canResearch(this.gs.currentPIdx, techId);
        const costStr  = Object.entries(tech.cost).map(([r,v]) => `${v} ${r}`).join(', ');
        const reqMet   = tech.requires.every(r => p.techs.includes(r));

        const item = document.createElement('div');
        item.className = `tech-item tier-${tech.tier} ${owned ? 'owned' : (canRes ? 'available' : 'locked')}`;
        item.innerHTML = `
          <div class="tech-icon">${tech.icon}</div>
          <div class="tech-info">
            <div class="tech-name">${tech.name} ${owned ? '✓' : ''}</div>
            <div class="tech-effect">${tech.effect}</div>
            <div class="tech-cost">${owned ? 'Researched' : costStr}</div>
            ${!reqMet ? `<div class="tech-req">Requires: ${tech.requires.join(', ')}</div>` : ''}
          </div>
          ${canRes ? `<button class="btn-research" data-tech="${techId}">Research</button>` : ''}
        `;
        section.appendChild(item);
      }

      content.appendChild(section);
    }

    content.querySelectorAll('.btn-research').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = this.gs.researchTech(this.gs.currentPIdx, btn.dataset.tech);
        if (result.ok) {
          this._openTechModal(); // refresh
          this._updateUI();
          this._addLogEntry(this.gs.log[0]);
        } else {
          this._showStatus(result.reason);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  // ── Diplomacy Modal ───────────────────────────────────────

  _openDiplomacyModal() {
    const modal   = document.getElementById('diplomacy-modal');
    const content = document.getElementById('diplomacy-content');
    const myId    = this.gs.currentPIdx;
    const p       = this.gs.players[myId];
    content.innerHTML = '';

    // Active agreements
    const myAgreements = this.gs.agreements.filter(a => a.p1 === myId || a.p2 === myId);
    if (myAgreements.length > 0) {
      const section = document.createElement('div');
      section.innerHTML = '<h3 class="diplo-section-title">Active Agreements</h3>';
      for (const a of myAgreements) {
        const otherId = a.p1 === myId ? a.p2 : a.p1;
        const other   = this.gs.players[otherId];
        const aCfg    = CONFIG.AGREEMENTS[a.type];
        const div     = document.createElement('div');
        div.className = 'agreement-item';
        div.innerHTML = `
          <span class="agr-icon">${aCfg.icon}</span>
          <span class="agr-info">
            <b>${aCfg.name}</b> with <span style="color:${other.color.primary}">${other.name}</span>
            ${a.turnsLeft > 0 ? `(${a.turnsLeft} turns left)` : '(Indefinite)'}
          </span>
          <button class="btn-break-agr btn-danger" data-id="${a.id}">Break</button>
        `;
        section.appendChild(div);
      }
      content.appendChild(section);
    }

    // Incoming proposals
    const incoming = this.gs.proposals.filter(pr => pr.to === myId);
    if (incoming.length > 0) {
      const section = document.createElement('div');
      section.innerHTML = '<h3 class="diplo-section-title">Incoming Proposals</h3>';
      for (const pr of incoming) {
        const from  = this.gs.players[pr.from];
        const aCfg  = CONFIG.AGREEMENTS[pr.type];
        const div   = document.createElement('div');
        div.className = 'proposal-item';
        div.innerHTML = `
          <span class="agr-icon">${aCfg.icon}</span>
          <span class="agr-info">
            <b>${aCfg.name}</b> from <span style="color:${from.color.primary}">${from.name}</span>
            <br><small>${aCfg.desc}</small>
          </span>
          <button class="btn-accept-prop btn-success" data-id="${pr.id}">Accept</button>
          <button class="btn-reject-prop btn-secondary" data-id="${pr.id}">Reject</button>
        `;
        section.appendChild(div);
      }
      content.appendChild(section);
    }

    // Propose new agreement
    const section2 = document.createElement('div');
    section2.innerHTML = '<h3 class="diplo-section-title">Propose Agreement</h3>';
    const others = this.gs.players.filter(pl => pl.isAlive && pl.id !== myId);

    const propForm = document.createElement('div');
    propForm.className = 'propose-form';
    propForm.innerHTML = `
      <select id="prop-target">
        ${others.map(o => `<option value="${o.id}" style="background:#0d1117">${o.name} (Rep: ${o.reputation})</option>`).join('')}
      </select>
      <select id="prop-type">
        ${Object.entries(CONFIG.AGREEMENTS).map(([id, a]) => `<option value="${id}">${a.icon} ${a.name}</option>`).join('')}
      </select>
      <button id="btn-propose-send" class="btn-primary">Propose</button>
    `;
    section2.appendChild(propForm);
    content.appendChild(section2);

    // Reputation display for all players
    const section3 = document.createElement('div');
    section3.innerHTML = '<h3 class="diplo-section-title">Reputations</h3>';
    const repGrid = document.createElement('div');
    repGrid.className = 'rep-grid';
    for (const pl of this.gs.players) {
      const div = document.createElement('div');
      div.className = 'rep-item';
      const repColor = pl.reputation >= 70 ? '#22c55e' : pl.reputation >= 40 ? '#f59e0b' : '#ef4444';
      div.innerHTML = `
        <span class="rep-name" style="color:${pl.color.primary}">${pl.name}</span>
        <div class="rep-bar-container">
          <div class="rep-bar" style="width:${pl.reputation}%;background:${repColor}"></div>
        </div>
        <span class="rep-val" style="color:${repColor}">${pl.reputation}</span>
      `;
      repGrid.appendChild(div);
    }
    section3.appendChild(repGrid);
    content.appendChild(section3);

    // Bind events
    content.querySelectorAll('.btn-break-agr').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Break this agreement? This will cost reputation.')) {
          this.gs.breakAgreementById(myId, btn.dataset.id);
          this._openDiplomacyModal();
          this._updateUI();
          this._addLogEntry(this.gs.log[0]);
        }
      });
    });

    content.querySelectorAll('.btn-accept-prop').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = this.gs.acceptAgreement(btn.dataset.id, myId);
        if (!result.ok) this._showStatus(result.reason);
        this._openDiplomacyModal();
        this._updateUI();
        if (this.gs.log[0]) this._addLogEntry(this.gs.log[0]);
      });
    });

    content.querySelectorAll('.btn-reject-prop').forEach(btn => {
      btn.addEventListener('click', () => {
        this.gs.rejectProposal(btn.dataset.id, myId);
        this._openDiplomacyModal();
      });
    });

    const propSend = content.querySelector('#btn-propose-send');
    if (propSend) {
      propSend.addEventListener('click', () => {
        const targetId = parseInt(content.querySelector('#prop-target').value);
        const type     = content.querySelector('#prop-type').value;
        const result   = this.gs.proposeAgreement(myId, targetId, type);
        if (!result.ok) this._showStatus(result.reason);
        else this._addLogEntry(this.gs.log[0]);
        this._openDiplomacyModal();
        this._updateUI();
      });
    }

    modal.classList.remove('hidden');
  }

  // ── Victory Screen ────────────────────────────────────────

  _showVictory() {
    const v  = this.gs.victory;
    const p  = this.gs.players[v.playerId];
    document.getElementById('game-screen').classList.add('hidden');
    const screen = document.getElementById('victory-screen');
    screen.classList.remove('hidden');

    document.getElementById('victory-title').textContent = `${p.name} Wins!`;
    document.getElementById('victory-title').style.color = p.color.primary;
    document.getElementById('victory-type').textContent  = v.desc;

    // Build scoreboard
    const scores = this.gs.players.map(pl => ({
      pl,
      score: this.gs.getPlayerTerritories(pl.id).length * 2 +
             pl.resources.gold / 20 +
             pl.techs.length * 3 +
             (pl.isAlive ? 10 : 0),
    })).sort((a, b) => b.score - a.score);

    const board = document.getElementById('scoreboard');
    board.innerHTML = scores.map((s, i) => `
      <div class="score-row">
        <span class="score-rank">${i+1}</span>
        <span class="score-name" style="color:${s.pl.color.primary}">${s.pl.name}</span>
        <span class="score-terr">${this.gs.getPlayerTerritories(s.pl.id).length} territories</span>
        <span class="score-tech">${s.pl.techs.length} techs</span>
        <span class="score-rep">Rep ${s.pl.reputation}</span>
        <span class="score-val">${Math.round(s.score)} pts</span>
      </div>
    `).join('');

    document.getElementById('btn-new-game').addEventListener('click', () => location.reload());
  }

  // ── UI Update ─────────────────────────────────────────────

  _updateUI() {
    if (!this.gs) return;
    const pidx = this.gs.currentPIdx;
    const p    = this.gs.players[pidx];
    if (!p) return;

    // Phase / turn display
    document.getElementById('turn-display').textContent  = `Turn ${this.gs.turn} / ${CONFIG.MAX_TURNS}`;
    document.getElementById('phase-display').textContent = this.gs.phase;

    const phaseBtn = document.getElementById('btn-end-phase');
    const phaseLabels = { DIPLOMACY: 'End Diplomacy →', BUILD: 'End Build Phase →', MOVE: 'End Move Phase →' };
    phaseBtn.textContent = phaseLabels[this.gs.phase] || 'Next Phase';

    // Current player indicator
    document.getElementById('current-player-name').textContent = p.name;
    document.getElementById('current-player-name').style.color = p.color.primary;
    document.getElementById('player-type-badge').textContent   = this.aiThinking ? '🤖 Thinking…' : (p.isAI ? '🤖 AI' : '👤 Human');

    // Resources
    const res = p.resources;
    const inc = this.gs.getIncome(pidx);
    const upc = this.gs.getUpkeep(pidx);
    document.getElementById('res-gold').innerHTML      = `💰 ${res.gold} <span class="inc">(+${inc.gold})</span>`;
    document.getElementById('res-food').innerHTML      = `🌾 ${res.food} <span class="inc">(+${Math.max(0,inc.food - upc.food)})</span>`;
    document.getElementById('res-iron').innerHTML      = `⚙ ${res.iron} <span class="inc">(+${inc.iron})</span>`;
    document.getElementById('res-knowledge').innerHTML = `📚 ${res.knowledge} <span class="inc">(+${inc.knowledge})</span>`;

    // Territory + unit counts
    const myTerr  = this.gs.getPlayerTerritories(pidx).length;
    const myUnits = this.gs.getPlayerUnits(pidx).length;
    document.getElementById('stat-territories').textContent = myTerr;
    document.getElementById('stat-units').textContent       = myUnits;
    document.getElementById('stat-techs').textContent       = p.techs.length;
    document.getElementById('stat-rep').textContent         = p.reputation;

    // Phase-specific controls visibility
    const isHuman = !p.isAI && !this.aiThinking;
    document.getElementById('btn-diplomacy').style.display  = (isHuman && this.gs.phase === 'DIPLOMACY') ? '' : 'none';
    document.getElementById('btn-build-unit').style.display = (isHuman && this.gs.phase === 'BUILD') ? '' : 'none';
    document.getElementById('btn-fortify').style.display    = (isHuman && this.gs.phase === 'BUILD') ? '' : 'none';
    document.getElementById('btn-tech').style.display       = (isHuman && this.gs.phase === 'BUILD') ? '' : 'none';
    document.getElementById('btn-move-units').style.display = (isHuman && this.gs.phase === 'MOVE' && !this.awaitingMove) ? '' : 'none';
    document.getElementById('btn-cancel-move').style.display= (isHuman && this.awaitingMove) ? '' : 'none';
    phaseBtn.style.display = isHuman ? '' : 'none';

    // Phase guide highlight
    document.querySelectorAll('.phase-step').forEach(el => {
      el.classList.toggle('active', el.dataset.phase === this.gs.phase);
    });

    // Player roster
    this._updatePlayerRoster();

    // Event log
    this._updateEventLog();
  }

  _updatePlayerRoster() {
    const roster = document.getElementById('player-roster');
    roster.innerHTML = this.gs.players.map(pl => {
      const terrCount = this.gs.getPlayerTerritories(pl.id).length;
      const unitCount = this.gs.getPlayerUnits(pl.id).length;
      const isCurrent = pl.id === this.gs.currentPIdx;
      return `
        <div class="roster-entry${isCurrent ? ' current' : ''}${!pl.isAlive ? ' eliminated' : ''}">
          <div class="roster-dot" style="background:${pl.color.primary}"></div>
          <div class="roster-name">${pl.name}</div>
          <div class="roster-stats">
            <span title="Territories">🗺 ${terrCount}</span>
            <span title="Units">⚔ ${unitCount}</span>
            <span title="Techs">📚 ${pl.techs.length}</span>
          </div>
          <div class="roster-rep" title="Reputation">Rep ${pl.reputation}</div>
        </div>
      `;
    }).join('');
  }

  _updateTerritoryPanel(t) {
    const panel    = document.getElementById('territory-panel');
    const terrDef  = CONFIG.TERRAINS[t.terrain];
    const owner    = t.owner !== null ? this.gs.players[t.owner] : null;
    const resStr   = Object.entries(terrDef.resources).map(([k,v]) => `${v} ${k}`).join(', ') || 'None';

    const byOwner = {};
    for (const u of t.units) {
      if (!byOwner[u.owner]) byOwner[u.owner] = [];
      byOwner[u.owner].push(u);
    }
    const unitStr = Object.entries(byOwner).map(([oid, units]) => {
      const byType = {};
      for (const u of units) byType[u.type] = (byType[u.type] || 0) + 1;
      const pl = this.gs.players[parseInt(oid)];
      return `<span style="color:${pl.color.mid}">${Object.entries(byType).map(([k,v]) => `${v}×${CONFIG.UNITS[k].name}`).join(', ')}</span>`;
    }).join('<br>');

    panel.innerHTML = `
      <div class="panel-terr-name">${terrDef.symbol} ${terrDef.name}</div>
      <div class="panel-row">Owner: <b style="color:${owner ? owner.color.primary : '#aaa'}">${owner ? owner.name : 'Neutral'}</b></div>
      <div class="panel-row">Income: ${resStr}</div>
      <div class="panel-row">Defense: +${terrDef.defBonus}${t.fortification > 0 ? ` + ${t.fortification*2} (fort)` : ''}</div>
      <div class="panel-row">Fortification: ${'◈'.repeat(t.fortification) || 'None'}</div>
      ${unitStr ? `<div class="panel-row units-row">Units:<br>${unitStr}</div>` : '<div class="panel-row">Units: None</div>'}
    `;
  }

  _updateEventLog() {
    const log = document.getElementById('event-log');
    const typeColors = {
      'system': '#60a5fa', 'build': '#34d399', 'combat-win': '#f87171',
      'combat-loss': '#fb923c', 'capture': '#a78bfa', 'tech': '#818cf8',
      'diplomacy': '#f0c040', 'betrayal': '#ef4444', 'warning': '#fbbf24',
      'elimination': '#f43f5e', 'info': '#94a3b8',
    };
    log.innerHTML = this.gs.log.slice(0, 20).map(entry => {
      const color = typeColors[entry.type] || '#94a3b8';
      return `<div class="log-entry" style="border-left-color:${color}">
        <span class="log-turn">T${entry.turn}</span>
        <span class="log-msg">${entry.msg}</span>
      </div>`;
    }).join('');
  }

  _addLogEntry(entry) {
    if (!entry) return;
    this._updateEventLog();
  }

  _closeModals() {
    document.querySelectorAll('.game-modal').forEach(m => m.classList.add('hidden'));
  }

  _showStatus(msg) {
    const el = document.getElementById('status-message');
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => { window.gameUI = new UIController(); });
