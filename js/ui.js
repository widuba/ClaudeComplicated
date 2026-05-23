'use strict';

// ============================================================
// THE REPUBLIC — UI Controller
// ============================================================

class UIController {
  constructor() {
    this.gs          = null;
    this.renderer    = null;
    this.aiPlayers   = {};
    this.aiRunning   = false;
    this.awaitingMove = false;
    this.selectedAbbr = null;
    this.selectedOps  = [];

    this._setupScreen();
    this._loop();
  }

  // ── Setup Screen ──────────────────────────────────────────

  _setupScreen() {
    const group = document.getElementById('player-count-group');
    const list  = document.getElementById('player-list');

    let numPlayers = 4;

    const factionKeys = Object.keys(CONFIG.FACTIONS);
    const personalities = Object.keys(CONFIG.AI_PERSONALITIES);

    const renderList = () => {
      list.innerHTML = '';
      for (let i = 0; i < numPlayers; i++) {
        const factionKey = factionKeys[i % factionKeys.length];
        const faction    = CONFIG.FACTIONS[factionKey];
        const row = document.createElement('div');
        row.className = 'player-config-row';
        row.innerHTML = `
          <div class="player-swatch" style="background:${faction.color.primary};border-color:${faction.color.light}"></div>
          <input class="player-name-input" data-idx="${i}" value="${faction.name}" placeholder="Faction name">
          <select class="player-faction-select" data-idx="${i}">
            ${factionKeys.map(k => `<option value="${k}" ${k === factionKey ? 'selected' : ''}>${CONFIG.FACTIONS[k].name}</option>`).join('')}
          </select>
          <label class="ai-label">
            <input type="checkbox" class="ai-check" data-idx="${i}" ${i > 0 ? 'checked' : ''}> AI
          </label>
          <select class="ai-personality-select" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>
            ${personalities.map(k => `<option value="${k}">${k}</option>`).join('')}
          </select>
        `;
        list.appendChild(row);

        // Update swatch when faction changes
        row.querySelector('.player-faction-select').addEventListener('change', (e) => {
          const fk = e.target.value;
          const sw = row.querySelector('.player-swatch');
          sw.style.background   = CONFIG.FACTIONS[fk].color.primary;
          sw.style.borderColor  = CONFIG.FACTIONS[fk].color.light;
          row.querySelector('.player-name-input').value = CONFIG.FACTIONS[fk].name;
        });

        // Toggle AI select
        row.querySelector('.ai-check').addEventListener('change', (e) => {
          row.querySelector('.ai-personality-select').disabled = !e.target.checked;
        });
      }
    };

    group.querySelectorAll('.btn-player-count').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.btn-player-count').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        numPlayers = parseInt(btn.dataset.count);
        renderList();
      });
    });

    renderList();

    document.getElementById('btn-start-game').addEventListener('click', () => {
      const configs = [];
      document.querySelectorAll('.player-config-row').forEach((row, i) => {
        configs.push({
          name:          row.querySelector('.player-name-input').value.trim() || `Faction ${i + 1}`,
          faction:       row.querySelector('.player-faction-select').value,
          isAI:          row.querySelector('.ai-check').checked,
          aiPersonality: row.querySelector('.ai-personality-select').value,
        });
      });
      this._startGame(configs);
    });
  }

  _startGame(playerConfigs) {
    this.gs = new GameState();
    this.gs.init(playerConfigs);

    const canvas = document.getElementById('game-canvas');
    canvas.width  = CONFIG.MAP_COLS * CONFIG.CELL_W + 20;
    canvas.height = CONFIG.MAP_ROWS * CONFIG.CELL_H + 20 + 46; // +46 for EV bar

    this.renderer = new Renderer(canvas);
    this.renderer.setGameState(this.gs);

    this.aiPlayers = {};
    for (const p of this.gs.players) {
      if (p.isAI) {
        this.aiPlayers[p.id] = new AIPlayer(p.id, p.aiPersonality);
      }
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    this._bindGameEvents(canvas);
    this._updateUI();

    if (this.gs.players[this.gs.currentPIdx].isAI) {
      this._maybeDoAITurn();
    }
  }

  _bindGameEvents(canvas) {
    canvas.addEventListener('click', (e) => this._onCanvasClick(e));

    document.getElementById('btn-end-phase').addEventListener('click', () => this._endPhase());
    document.getElementById('btn-diplomacy').addEventListener('click', () => this._openDiplomacy());
    document.getElementById('btn-build-unit').addEventListener('click', () => this._openDeploy());
    document.getElementById('btn-fortify').addEventListener('click', () => this._doEntrench());
    document.getElementById('btn-tech').addEventListener('click', () => this._openResearch());
    document.getElementById('btn-move-units').addEventListener('click', () => this._enterMoveMode());
    document.getElementById('btn-cancel-move').addEventListener('click', () => this._cancelMove());

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this._closeModals());
    });
    document.getElementById('modal-overlay').addEventListener('click', () => this._closeModals());
    document.getElementById('btn-new-game').addEventListener('click', () => {
      document.getElementById('victory-screen').classList.add('hidden');
      document.getElementById('setup-screen').classList.remove('hidden');
    });
  }

  // ── Canvas Click ──────────────────────────────────────────

  _onCanvasClick(e) {
    if (!this.gs || this.aiRunning) return;
    const pidx = this.gs.currentPIdx;
    if (this.gs.players[pidx].isAI) return;

    const rect = this.renderer.canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;
    const abbr = this.renderer._pixelToState(px, py);
    if (!abbr) return;

    const t = this.gs.territories[abbr];

    if (this.awaitingMove) {
      if (abbr === this.selectedAbbr) {
        this._cancelMove();
        return;
      }
      if (this.renderer.moveable.has(abbr) || this.renderer.attackable.has(abbr)) {
        const result = this.gs.moveOps(this.selectedAbbr, abbr, pidx, this.selectedOps);
        if (result.ok) {
          this._showCombatToast(result.captured
            ? `Seized ${abbr}! [${result.atkStr} vs ${result.defStr}]`
            : result.atkStr !== undefined
              ? `Repelled from ${abbr}. [${result.atkStr} vs ${result.defStr}]`
              : `Moved to ${abbr}.`
          );
          if (this.gs.checkVictory()) { this._showVictory(); return; }
        }
        this._cancelMove();
      } else {
        // Click a different owned state to re-select
        if (t.owner === pidx) {
          this._selectStateForMove(abbr, t, pidx);
        }
      }
    } else {
      // Normal click — show territory info
      this.renderer.selectTerritory(abbr);
      this._showTerritoryPanel(abbr);
    }

    this._updateUI();
  }

  _selectStateForMove(abbr, t, pidx) {
    const myOps = t.ops.filter(op => op.owner === pidx && !op.moved);
    if (myOps.length === 0) {
      this._setStatus('No available ops in this state.');
      return;
    }
    this.selectedAbbr = abbr;
    this.selectedOps  = [...new Set(myOps.map(op => op.type))];
    this.awaitingMove = true;
    this.renderer.showMoveRange(abbr, this.selectedOps, pidx);
    document.getElementById('btn-cancel-move').classList.remove('hidden');
    this._setStatus(`Select destination for ops in ${abbr}. Yellow = selectable. Red = hostile.`);
  }

  _cancelMove() {
    this.awaitingMove = false;
    this.selectedAbbr = null;
    this.selectedOps  = [];
    this.renderer.clearSelection();
    document.getElementById('btn-cancel-move').classList.add('hidden');
    this._setStatus('');
  }

  _enterMoveMode() {
    const pidx = this.gs.currentPIdx;
    if (this.gs.phase !== 'MARCH') {
      this._setStatus('Move/Attack is only available in the March phase.');
      return;
    }
    this._setStatus('Click one of your states to select ops for movement.');
    this._setStatus('Click a state with your ops to begin movement.');
  }

  // ── Phase / Turn ──────────────────────────────────────────

  _endPhase() {
    if (!this.gs || this.aiRunning) return;
    const pidx = this.gs.currentPIdx;
    if (this.gs.players[pidx].isAI) return;

    this._cancelMove();
    const prevPIdx = this.gs.currentPIdx;
    this.gs.endPlayerTurn();

    if (this.gs.checkVictory()) { this._showVictory(); return; }

    this._afterTurn(prevPIdx);
  }

  _afterTurn(prevPIdx) {
    this._updateUI();
    const pidx = this.gs.currentPIdx;
    if (this.gs.players[pidx].isAI) {
      setTimeout(() => this._maybeDoAITurn(), 300);
    }
  }

  async _maybeDoAITurn() {
    if (this.aiRunning) return;
    const pidx = this.gs.currentPIdx;
    const p    = this.gs.players[pidx];
    if (!p.isAI || !p.alive) {
      this.gs.endPlayerTurn();
      this._afterTurn(pidx);
      return;
    }

    this.aiRunning = true;
    this._setStatus(`${p.name} is deliberating...`);

    const ai = this.aiPlayers[pidx];
    if (ai) {
      await ai.takeTurn(this.gs, (msg) => {
        this._setStatus(msg);
        this._updateUI();
      });
    }

    this.gs.endPlayerTurn();

    if (this.gs.checkVictory()) {
      this.aiRunning = false;
      this._showVictory();
      return;
    }

    this.aiRunning = false;
    this._afterTurn(pidx);
  }

  // ── UI Update ─────────────────────────────────────────────

  _updateUI() {
    if (!this.gs) return;
    const pidx = this.gs.currentPIdx;
    const p    = this.gs.players[pidx];

    // Turn / Phase display
    document.getElementById('turn-display').textContent  = `Turn ${this.gs.turn} / ${CONFIG.MAX_TURNS}`;
    document.getElementById('phase-display').textContent = this.gs.phase;

    // Current player box
    document.getElementById('current-player-name').textContent = p.name;
    document.getElementById('current-player-name').style.color = p.color.primary;
    document.getElementById('player-type-badge').textContent   = p.isAI ? '🤖 AI' : '👤 Human';

    // Resources
    const res = p.resources;
    document.getElementById('res-funds').textContent   = `💰 Funds: ${res.funds || 0}`;
    document.getElementById('res-media').textContent   = `📺 Media: ${res.media || 0}`;
    document.getElementById('res-ground').textContent  = `🤝 Ground: ${res.ground || 0}`;
    document.getElementById('res-capital').textContent = `🔮 Capital: ${res.capital || 0}`;

    // Stats
    const myStates = Object.values(this.gs.territories).filter(t => t.owner === pidx);
    const myOps    = Object.values(this.gs.territories).flatMap(t => t.ops.filter(op => op.owner === pidx));
    document.getElementById('stat-ev').textContent          = `${this.gs.getEV(pidx)} / ${CONFIG.EV_WIN}`;
    document.getElementById('stat-states').textContent      = myStates.length;
    document.getElementById('stat-ops').textContent         = myOps.length;
    document.getElementById('stat-policies').textContent    = p.policies.size;
    document.getElementById('stat-rep').textContent         = `${p.reputation} / 100`;
    document.getElementById('stat-exposure').textContent    = `${p.exposure} / ${CONFIG.SCANDAL_THRESHOLD}`;

    // Phase guide
    document.querySelectorAll('.phase-step').forEach(el => {
      el.classList.toggle('active', el.dataset.phase === this.gs.phase);
    });

    // Phase button text
    const phases = ['DIPLOMACY', 'BUILD', 'MARCH'];
    const idx    = phases.indexOf(this.gs.phase);
    const nextPhase = idx < phases.length - 1 ? phases[idx + 1] : 'End Turn';
    document.getElementById('btn-end-phase').textContent = `End ${this.gs.phase} →`;

    // Action button states
    const isHuman = !p.isAI;
    const inDip   = this.gs.phase === 'DIPLOMACY';
    const inBuild = this.gs.phase === 'BUILD';
    const inMarch = this.gs.phase === 'MARCH';
    document.getElementById('btn-diplomacy').disabled  = !isHuman || !inDip;
    document.getElementById('btn-build-unit').disabled = !isHuman || !inBuild;
    document.getElementById('btn-fortify').disabled    = !isHuman || !inBuild;
    document.getElementById('btn-tech').disabled       = !isHuman || !inBuild;
    document.getElementById('btn-move-units').disabled = !isHuman || !inMarch;

    // Roster
    this._updateRoster();

    // Event log
    this._updateLog();
  }

  _updateRoster() {
    const roster = document.getElementById('player-roster');
    roster.innerHTML = '';
    for (const p of this.gs.players) {
      const ev   = this.gs.getEV(p.id);
      const card = document.createElement('div');
      card.className = `roster-card ${p.id === this.gs.currentPIdx ? 'active' : ''} ${!p.alive ? 'eliminated' : ''}`;
      card.style.setProperty('--faction-color', p.color.primary);
      card.innerHTML = `
        <div class="roster-name" style="color:${p.color.primary}">${p.name}</div>
        <div class="roster-ev">${ev} EV</div>
        <div class="roster-rep">Rep: ${p.reputation}</div>
        ${p.exposure > 0 ? `<div class="roster-exposure">⚠ ${p.exposure} exposure</div>` : ''}
      `;
      roster.appendChild(card);
    }
  }

  _updateLog() {
    const logEl = document.getElementById('event-log');
    logEl.innerHTML = this.gs.log.slice(0, 30).map(e =>
      `<div class="log-entry"><span class="log-turn">T${e.turn}</span> <span class="log-src">${e.src}</span> ${e.msg}</div>`
    ).join('');
  }

  _showTerritoryPanel(abbr) {
    const t      = this.gs.territories[abbr];
    const stDef  = CONFIG.STATE_TYPES[t.lean];
    const owner  = t.owner !== null ? this.gs.players[t.owner] : null;
    const panel  = document.getElementById('territory-panel');

    const byType = {};
    for (const op of t.ops) byType[op.type] = (byType[op.type] || 0) + 1;
    const opsStr = Object.entries(byType).map(([k, v]) => `${v}× ${CONFIG.OPERATIONS[k].name}`).join('<br>') || 'None';
    const inc    = stDef.income;

    panel.innerHTML = `
      <div class="territory-header" style="border-color:${owner ? owner.color.primary : '#555'}">
        <div class="terr-name">${t.name} (${t.abbr})</div>
        <div class="terr-ev">${t.ev} Electoral Votes</div>
        <div class="terr-lean" style="color:${stDef.border}">${stDef.name}</div>
        <div class="terr-owner" style="color:${owner ? owner.color.primary : '#888'}">
          ${owner ? `Controlled by: ${owner.name}` : '⬜ Neutral'}
        </div>
      </div>
      <div class="terr-details">
        <div class="terr-row"><span>Defense</span><span>${stDef.defBonus + t.entrenched * 2}${t.entrenched > 0 ? ` (+${t.entrenched * 2} entrenched)` : ''}</span></div>
        <div class="terr-row"><span>Entrench</span><span>${'◈'.repeat(t.entrenched) || '—'}</span></div>
        <div class="terr-row"><span>Income</span><span>💰${inc.funds} 📺${inc.media} 🤝${inc.ground} 🔮${inc.capital}</span></div>
      </div>
      <div class="terr-ops-title">Operations Present</div>
      <div class="terr-ops">${opsStr}</div>
    `;
  }

  // ── Modals ────────────────────────────────────────────────

  _openDeploy() {
    if (this.gs.phase !== 'BUILD') return;
    const pidx    = this.gs.currentPIdx;
    const p       = this.gs.players[pidx];
    const myStates = Object.values(this.gs.territories).filter(t => t.owner === pidx);
    const content = document.getElementById('build-content');

    if (myStates.length === 0) {
      content.innerHTML = '<p class="modal-empty">You control no states. Cannot deploy.</p>';
    } else {
      content.innerHTML = `
        <div class="build-top">
          <label class="build-label">Deploy in State:</label>
          <select id="build-state-select" class="build-select">
            ${myStates.map(t => `<option value="${t.abbr}">${t.name} (${t.abbr})</option>`).join('')}
          </select>
        </div>
        <div class="unit-grid">
          ${Object.entries(CONFIG.OPERATIONS).map(([key, def]) => {
            const chk = this.gs.canDeploy(pidx, myStates[0].abbr, key);
            return `
              <div class="unit-card ${chk.ok ? '' : 'disabled'}" data-op="${key}">
                <div class="unit-icon">${def.icon}</div>
                <div class="unit-name">${def.name}</div>
                <div class="unit-stats">Atk ${def.attack} | Def ${def.defense} | Mv ${def.move}</div>
                <div class="unit-cost">${Object.entries(def.cost).map(([r,v]) => `${v} ${r}`).join(', ')}</div>
                <div class="unit-desc">${def.desc}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      content.querySelectorAll('.unit-card:not(.disabled)').forEach(card => {
        card.addEventListener('click', () => {
          const opType = card.dataset.op;
          const stateAbbr = document.getElementById('build-state-select').value;
          const result = this.gs.deployOp(pidx, stateAbbr, opType);
          if (result.ok) {
            this._closeModals();
            this._updateUI();
          } else {
            this._setStatus(result.reason || 'Cannot deploy.');
          }
        });
      });
    }

    this._openModal('build-modal');
  }

  _openResearch() {
    if (this.gs.phase !== 'BUILD') return;
    const pidx    = this.gs.currentPIdx;
    const p       = this.gs.players[pidx];
    const content = document.getElementById('tech-content');

    const branches = ['Digital', 'Populist', 'Dark Arts', 'Coalition'];
    content.innerHTML = branches.map(branch => {
      const policies = Object.entries(CONFIG.POLICIES).filter(([, v]) => v.branch === branch);
      return `
        <div class="tech-branch">
          <div class="tech-branch-title">${branch}</div>
          ${policies.map(([key, def]) => {
            const has = p.policies.has(key);
            const chk = this.gs.canResearch(pidx, key);
            return `
              <div class="tech-card ${has ? 'researched' : chk.ok ? '' : 'locked'}" data-key="${key}">
                <span class="tech-icon">${def.icon}</span>
                <div class="tech-info">
                  <div class="tech-name">${def.name}</div>
                  <div class="tech-effect">${def.effect}</div>
                  <div class="tech-cost">${Object.entries(def.cost).map(([r,v]) => `${v} ${r}`).join(', ')}</div>
                  ${!chk.ok && !has ? `<div class="tech-reason">${chk.reason}</div>` : ''}
                </div>
                ${has ? '<span class="tech-check">✓</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');

    content.querySelectorAll('.tech-card:not(.researched):not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        const result = this.gs.researchPolicy(pidx, card.dataset.key);
        if (result.ok) {
          this._closeModals();
          this._updateUI();
        } else {
          this._setStatus(result.reason || 'Cannot research.');
        }
      });
    });

    this._openModal('tech-modal');
  }

  _openDiplomacy() {
    if (this.gs.phase !== 'DIPLOMACY') return;
    const pidx    = this.gs.currentPIdx;
    const content = document.getElementById('diplomacy-content');

    const coalitions = this.gs.getActiveCoalitions(pidx);
    const pending    = this.gs.getPendingCoalitions(pidx);
    const others     = this.gs.players.filter(p => p.id !== pidx && p.alive);

    content.innerHTML = `
      <div class="diplo-section">
        <h3 class="diplo-title">Active Coalitions</h3>
        ${coalitions.length === 0 ? '<p class="diplo-empty">No active coalitions.</p>' : ''}
        ${coalitions.map(c => {
          const partnerId = c.p1 === pidx ? c.p2 : c.p1;
          const partner   = this.gs.players[partnerId];
          const idx       = this.gs.coalitions.indexOf(c);
          return `
            <div class="coalition-row" style="border-color:${partner.color.primary}33">
              <div class="coalition-info">
                <span style="color:${partner.color.primary}">${partner.name}</span>
                — ${CONFIG.COALITION_TYPES[c.type].name}
                ${c.duration > 0 ? `(${c.duration - (this.gs.turn - c.turnMade)} turns left)` : '(indefinite)'}
              </div>
              <button class="btn-break-coalition" data-idx="${idx}">Break ⚡</button>
            </div>
          `;
        }).join('')}
      </div>

      <div class="diplo-section">
        <h3 class="diplo-title">Pending Proposals</h3>
        ${pending.length === 0 ? '<p class="diplo-empty">No incoming proposals.</p>' : ''}
        ${pending.map(({ coalition: c, idx }) => {
          const partner = this.gs.players[c.p1];
          return `
            <div class="coalition-row">
              <div class="coalition-info">
                <span style="color:${partner.color.primary}">${partner.name}</span>
                offers: ${CONFIG.COALITION_TYPES[c.type].name}
              </div>
              <button class="btn-accept-coalition" data-idx="${idx}">Accept</button>
              <button class="btn-reject-coalition" data-idx="${idx}">Reject</button>
            </div>
          `;
        }).join('')}
      </div>

      <div class="diplo-section">
        <h3 class="diplo-title">Propose Coalition</h3>
        <div class="diplo-propose-grid">
          ${others.map(other => `
            <div class="diplo-player-card" style="border-color:${other.color.primary}55">
              <div class="diplo-player-name" style="color:${other.color.primary}">${other.name}</div>
              <div class="diplo-player-ev">${this.gs.getEV(other.id)} EV</div>
              <div class="diplo-btns">
                ${Object.keys(CONFIG.COALITION_TYPES).map(type => `
                  <button class="btn-propose" data-target="${other.id}" data-type="${type}">${CONFIG.COALITION_TYPES[type].name}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    content.querySelectorAll('.btn-break-coalition').forEach(btn => {
      btn.addEventListener('click', () => {
        this.gs.breakCoalition(parseInt(btn.dataset.idx), pidx);
        this._openDiplomacy();
        this._updateUI();
      });
    });

    content.querySelectorAll('.btn-accept-coalition').forEach(btn => {
      btn.addEventListener('click', () => {
        this.gs.acceptCoalition(parseInt(btn.dataset.idx));
        this._openDiplomacy();
        this._updateUI();
      });
    });

    content.querySelectorAll('.btn-reject-coalition').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = this.gs.coalitions[parseInt(btn.dataset.idx)];
        if (c) c.pending = false;
        this._openDiplomacy();
      });
    });

    content.querySelectorAll('.btn-propose').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = this.gs.proposeCoalition(btn.dataset.type, pidx, parseInt(btn.dataset.target));
        if (result.ok) {
          this._closeModals();
          this._updateUI();
        } else {
          this._setStatus(result.reason || 'Cannot propose.');
        }
      });
    });

    this._openModal('diplomacy-modal');
  }

  _doEntrench() {
    if (this.gs.phase !== 'BUILD') return;
    const pidx = this.gs.currentPIdx;
    const sel  = this.renderer.selected;
    if (!sel || this.gs.territories[sel]?.owner !== pidx) {
      this._setStatus('Select one of your states first, then click Entrench.');
      return;
    }
    const result = this.gs.entrenchState(pidx, sel);
    if (!result.ok) this._setStatus(result.reason);
    this._updateUI();
  }

  _openModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
  }

  _closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelectorAll('.game-modal').forEach(m => m.classList.add('hidden'));
  }

  _setStatus(msg) {
    document.getElementById('status-message').textContent = msg;
  }

  _showCombatToast(msg) {
    const toast = document.getElementById('combat-toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  // ── Victory Screen ────────────────────────────────────────

  _showVictory() {
    const winner = this.gs.players[this.gs.winner];
    document.getElementById('victory-title').textContent = `${winner.name} Wins!`;
    document.getElementById('victory-title').style.color = winner.color.primary;
    document.getElementById('victory-type').textContent  = this.gs.winType;

    const board = document.getElementById('scoreboard');
    const sorted = [...this.gs.players].sort((a, b) => this.gs.getScore(b.id) - this.gs.getScore(a.id));
    board.innerHTML = sorted.map((p, i) => `
      <div class="score-row ${p.id === this.gs.winner ? 'winner' : ''} ${!p.alive ? 'eliminated' : ''}">
        <span class="score-rank">${i + 1}</span>
        <span class="score-name" style="color:${p.color.primary}">${p.name}</span>
        <span class="score-ev">${this.gs.getEV(p.id)} EV</span>
        <span class="score-val">${this.gs.getScore(p.id)} pts</span>
      </div>
    `).join('');

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.remove('hidden');
  }

  // ── RAF Loop ──────────────────────────────────────────────

  _loop() {
    if (this.renderer) this.renderer.draw();
    requestAnimationFrame(() => this._loop());
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.ui = new UIController();
});
