'use strict';

// ============================================================
// THE REPUBLIC — Canvas Renderer (State Grid Map)
// ============================================================

class Renderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.gs      = null;

    this.selected    = null;  // selected state abbr
    this.hovered     = null;
    this.moveable    = new Set();
    this.attackable  = new Set();

    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this._canvasPos(e);
      const abbr = this._pixelToState(pos.x, pos.y);
      this.hovered = abbr;
    });
    this.canvas.addEventListener('mouseleave', () => { this.hovered = null; });
  }

  _canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _stateRect(col, row) {
    const W = CONFIG.CELL_W, H = CONFIG.CELL_H;
    const offX = 10, offY = 10;
    return { x: offX + col * W, y: offY + row * H, w: W - 2, h: H - 2 };
  }

  _pixelToState(px, py) {
    if (!this.gs) return null;
    const W = CONFIG.CELL_W, H = CONFIG.CELL_H;
    const offX = 10, offY = 10;
    const col = Math.floor((px - offX) / W);
    const row = Math.floor((py - offY) / H);
    for (const [abbr, def] of Object.entries(CONFIG.STATES)) {
      if (def.col === col && def.row === row) return abbr;
    }
    return null;
  }

  setGameState(gs) { this.gs = gs; }

  selectTerritory(key) {
    this.selected = key;
    this.moveable.clear();
    this.attackable.clear();
  }

  showMoveRange(abbr, opTypes, playerId) {
    this.selected = abbr;
    this.moveable.clear();
    this.attackable.clear();
    if (!this.gs) return;
    const range = this.gs.getMoveRange(abbr, opTypes, playerId);
    for (const [rk] of range) {
      const t = this.gs.territories[rk];
      if (!t) continue;
      if (t.owner !== null && t.owner !== playerId && !this.gs.areAllied(playerId, t.owner)) {
        this.attackable.add(rk);
      } else {
        this.moveable.add(rk);
      }
    }
  }

  clearSelection() {
    this.selected = null;
    this.moveable.clear();
    this.attackable.clear();
  }

  // ── Main Draw ─────────────────────────────────────────────

  draw() {
    if (!this.gs) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    ctx.fillStyle = '#060b12';
    ctx.fillRect(0, 0, W, H);

    // Draw grid background
    this._drawGrid();

    // Draw all states
    for (const abbr of Object.keys(this.gs.territories)) {
      this._drawState(abbr);
    }

    // Draw ops on all states
    for (const abbr of Object.keys(this.gs.territories)) {
      const t = this.gs.territories[abbr];
      if (t.ops.length > 0) this._drawOps(abbr, t);
    }

    // EV counter bar
    this._drawEVBar();

    // Hover tooltip
    if (this.hovered && this.gs.territories[this.hovered]) {
      this._drawTooltip(this.hovered);
    }
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#0d1a28';
    ctx.lineWidth   = 0.5;
    const W = CONFIG.CELL_W, H = CONFIG.CELL_H;
    const offX = 10, offY = 10;
    for (let c = 0; c <= CONFIG.MAP_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(offX + c * W, offY);
      ctx.lineTo(offX + c * W, offY + CONFIG.MAP_ROWS * H);
      ctx.stroke();
    }
    for (let r = 0; r <= CONFIG.MAP_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(offX, offY + r * H);
      ctx.lineTo(offX + CONFIG.MAP_COLS * W, offY + r * H);
      ctx.stroke();
    }
  }

  _drawState(abbr) {
    const ctx  = this.ctx;
    const t    = this.gs.territories[abbr];
    const stDef = CONFIG.STATE_TYPES[t.lean];
    const rect  = this._stateRect(t.col, t.row);
    const { x, y, w, h } = rect;

    const isSelected  = this.selected   === abbr;
    const isHovered   = this.hovered    === abbr;
    const isMoveable  = this.moveable.has(abbr);
    const isAttackable = this.attackable.has(abbr);

    // Base fill
    let fillColor = stDef.color;
    if (t.owner !== null) {
      const owner = this.gs.players[t.owner];
      fillColor = this._blendColor(stDef.color, owner.color.dark, 0.55);
    }
    if (isMoveable)   fillColor = this._blendColor(fillColor, '#003366', 0.5);
    if (isAttackable) fillColor = this._blendColor(fillColor, '#660000', 0.5);

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();

    // Owner color stripe on left edge
    if (t.owner !== null) {
      const owner = this.gs.players[t.owner];
      ctx.fillStyle = owner.color.primary;
      ctx.fillRect(x, y, 4, h);
    }

    // Border
    if (isSelected) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur  = 8;
    } else if (isHovered) {
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 0;
    } else if (isMoveable) {
      ctx.strokeStyle = '#4499ff';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#4499ff';
      ctx.shadowBlur  = 4;
    } else if (isAttackable) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur  = 4;
    } else {
      ctx.strokeStyle = t.owner !== null ? this.gs.players[t.owner].color.mid + 'aa' : stDef.border;
      ctx.lineWidth   = 0.8;
      ctx.shadowBlur  = 0;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // State abbreviation
    ctx.fillStyle = '#ffffffcc';
    ctx.font      = `bold 10px 'Inter', sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(abbr, x + 6, y + 4);

    // EV count
    ctx.fillStyle = isAttackable ? '#ff8888' : isMoveable ? '#88ccff' : '#aabbcc';
    ctx.font      = `9px 'Inter', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${t.ev}EV`, x + w - 3, y + 4);

    // Entrenched indicator
    if (t.entrenched > 0) {
      ctx.fillStyle = '#f0c040cc';
      ctx.font      = `9px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('◈'.repeat(t.entrenched), x + 5, y + h - 3);
    }

    // Lean type dot
    const leanColors = { SAFE_BLUE: '#4488ff', LEAN_BLUE: '#6699dd', SWING: '#aa66cc', LEAN_RED: '#cc6666', RURAL_RED: '#aa2222', DC: '#cc44cc' };
    ctx.fillStyle = leanColors[t.lean] || '#888';
    ctx.beginPath();
    ctx.arc(x + w - 6, y + h - 6, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawOps(abbr, t) {
    const ctx  = this.ctx;
    const rect  = this._stateRect(t.col, t.row);
    const { x, y, w, h } = rect;

    const byOwner = {};
    for (const op of t.ops) {
      if (!byOwner[op.owner]) byOwner[op.owner] = {};
      byOwner[op.owner][op.type] = (byOwner[op.owner][op.type] || 0) + 1;
    }

    const owners   = Object.keys(byOwner);
    const dotR     = 7;
    const startX   = x + 8;
    let   curX     = startX;
    const dotY     = y + h - 12;

    for (const oid of owners) {
      const player = this.gs.players[parseInt(oid)];
      const types  = Object.keys(byOwner[oid]);
      for (const type of types.slice(0, 3)) {
        const count = byOwner[oid][type];
        const def   = CONFIG.OPERATIONS[type];

        // Shadow
        ctx.beginPath();
        ctx.arc(curX + 1, dotY + 1, dotR, 0, Math.PI * 2);
        ctx.fillStyle = '#00000088';
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(curX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = player.color.mid;
        ctx.fill();
        ctx.strokeStyle = player.color.primary;
        ctx.lineWidth   = 1;
        ctx.stroke();

        // Icon
        ctx.fillStyle = '#ffffffdd';
        ctx.font      = `8px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, curX, dotY);

        // Count badge
        if (count > 1) {
          ctx.beginPath();
          ctx.arc(curX + 5, dotY - 5, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#111';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font      = `bold 6px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(count, curX + 5, dotY - 5);
        }

        curX += dotR * 2 + 2;
        if (curX > x + w - 8) break;
      }
      if (curX > x + w - 8) break;
    }
  }

  _drawEVBar() {
    const ctx = this.ctx;
    const bx = 10, by = this.canvas.height - 36;
    const bw = CONFIG.MAP_COLS * CONFIG.CELL_W;
    const bh = 22;

    ctx.fillStyle = '#0d1a28';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();

    const totalEV = 538;
    let curX = bx;

    for (const p of this.gs.players) {
      if (!p.alive) continue;
      const ev = this.gs.getEV(p.id);
      const w  = Math.round((ev / totalEV) * bw);
      if (w < 1) continue;
      ctx.fillStyle = p.color.mid;
      ctx.fillRect(curX, by, w, bh);
      if (w > 24) {
        ctx.fillStyle = '#fff';
        ctx.font      = `bold 9px 'Inter', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${p.name.split(' ')[1] || p.name}: ${ev}`, curX + w / 2, by + bh / 2);
      }
      curX += w;
    }

    // 270 EV marker
    const markerX = bx + Math.round((CONFIG.EV_WIN / totalEV) * bw);
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(markerX, by - 4);
    ctx.lineTo(markerX, by + bh + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffe066';
    ctx.font      = `bold 9px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('270', markerX, by - 7);

    // Border
    ctx.strokeStyle = '#1e3a5a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.stroke();
  }

  _drawTooltip(abbr) {
    const ctx  = this.ctx;
    const t    = this.gs.territories[abbr];
    const stDef = CONFIG.STATE_TYPES[t.lean];
    const owner = t.owner !== null ? this.gs.players[t.owner] : null;
    const rect  = this._stateRect(t.col, t.row);

    const byType = {};
    for (const op of t.ops) byType[op.type] = (byType[op.type] || 0) + 1;

    const lines = [
      `${t.name} (${t.abbr})`,
      `${stDef.name}  •  ${t.ev} Electoral Votes`,
      `Controlled by: ${owner ? owner.name : 'No one'}`,
      `Defense: ${stDef.defBonus + t.entrenched * 2}${t.entrenched > 0 ? ` (entrenched +${t.entrenched * 2})` : ''}`,
    ];

    const inc = stDef.income;
    lines.push(`Income: 💰${inc.funds} 📺${inc.media} 🤝${inc.ground} 🔮${inc.capital}`);

    if (Object.keys(byType).length > 0) {
      lines.push('Ops: ' + Object.entries(byType).map(([k, v]) => `${v}×${CONFIG.OPERATIONS[k].name}`).join(', '));
    }

    const pad = 8, lh = 16, fs = 11;
    const w   = 230, h = lines.length * lh + pad * 2;
    let tx = rect.x + CONFIG.CELL_W + 4;
    let ty = rect.y;

    // Keep tooltip in canvas bounds
    if (tx + w > this.canvas.width - 10) tx = rect.x - w - 4;
    if (ty + h > this.canvas.height - 40) ty = this.canvas.height - 40 - h;
    ty = Math.max(10, ty);

    ctx.fillStyle = '#0d1a28ee';
    ctx.strokeStyle = '#2d4060';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, w, h, 5);
    ctx.fill();
    ctx.stroke();

    lines.forEach((line, i) => {
      ctx.fillStyle    = i === 0 ? '#f0c040' : i === 1 ? '#88aacc' : '#c8d8f0';
      ctx.font         = `${i === 0 ? 'bold ' : ''}${fs}px 'Inter', sans-serif`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line, tx + pad, ty + pad + i * lh);
    });
  }

  _blendColor(hex1, hex2, t) {
    const parse = h => h.startsWith('#')
      ? [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
      : [128, 128, 128];
    try {
      const c1 = parse(hex1), c2 = parse(hex2);
      const r  = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g  = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b  = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      return `rgb(${r},${g},${b})`;
    } catch { return hex1; }
  }
}

// roundRect polyfill
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y,   x + w, y + r,   r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x,     y + h, x,     y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x,     y,     x + r, y,         r);
    this.closePath();
  };
}
