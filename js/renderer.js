'use strict';

// ============================================================
// GRAND DOMINION — Canvas Renderer
// ============================================================

// Polyfill roundRect for Safari < 15.4
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

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.gs     = null;  // set by UI after init

    this.camera = { x: 0, y: 0, zoom: 1 };
    this.selected   = null;  // selected territory key
    this.hovered    = null;
    this.moveRange  = null;  // Map: key → dist
    this.highlight  = new Set(); // keys to highlight
    this.attackable = new Set(); // keys that are attackable
    this.moveable   = new Set(); // keys that are moveable
    this.animQueue  = [];
    this._lastAnim  = 0;

    this._setupCamera();
    this._bindEvents();
  }

  _setupCamera() {
    // Center hex (0,0) in the canvas
    this.camera.x = this.canvas.width  / 2;
    this.camera.y = this.canvas.height / 2;
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this._canvasPos(e);
      const hex = Hex.fromPixel(pos.x - this.camera.x, pos.y - this.camera.y, CONFIG.HEX_SIZE);
      const k   = Hex.key(hex.q, hex.r);
      if (this.gs && this.gs.territories[k]) {
        this.hovered = k;
      } else {
        this.hovered = null;
      }
    });
    this.canvas.addEventListener('mouseleave', () => { this.hovered = null; });
  }

  _canvasPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  setGameState(gs) { this.gs = gs; }

  selectTerritory(key) {
    this.selected = key;
    this.moveable.clear();
    this.attackable.clear();
  }

  showMoveRange(key, unitTypes, playerId) {
    this.selected = key;
    this.moveable.clear();
    this.attackable.clear();
    if (!this.gs) return;
    const range = this.gs.getMoveRange(key, unitTypes, playerId);
    for (const [rk, dist] of range) {
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
    this.moveRange = null;
  }

  // ── Main Draw ─────────────────────────────────────────────

  draw() {
    if (!this.gs) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);

    // Draw all hexes
    for (const t of Object.values(this.gs.territories)) {
      this._drawHex(t);
    }

    // Draw unit stacks
    for (const t of Object.values(this.gs.territories)) {
      if (t.units.length > 0) this._drawUnits(t);
    }

    // Hover tooltip
    if (this.hovered && this.gs.territories[this.hovered]) {
      this._drawHoverInfo(this.gs.territories[this.hovered]);
    }

    ctx.restore();
  }

  _drawHex(t) {
    const ctx = this.ctx;
    const S   = CONFIG.HEX_SIZE;
    const px  = Hex.toPixel(t.q, t.r, S);
    const cx  = px.x, cy = px.y;

    const terrDef   = CONFIG.TERRAINS[t.terrain];
    const owner     = t.owner !== null ? this.gs.players[t.owner] : null;
    const isSelected = this.selected === t.key;
    const isHovered  = this.hovered  === t.key;
    const isMoveable = this.moveable.has(t.key);
    const isAttack   = this.attackable.has(t.key);

    const corners = Hex.hexCorners(cx, cy, S - 1);

    // Draw hex fill
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();

    // Base terrain color
    let fillColor = terrDef.color;

    // Owner tint
    if (owner) {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, S);
      gradient.addColorStop(0, this._blendColor(terrDef.light, owner.color.primary, 0.45));
      gradient.addColorStop(1, this._blendColor(terrDef.color, owner.color.primary, 0.30));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = fillColor;
    }

    if (isMoveable) {
      ctx.fillStyle = this._blendColor(fillColor, '#00aaff', 0.4);
    }
    if (isAttack) {
      ctx.fillStyle = this._blendColor(fillColor, '#ff4444', 0.45);
    }

    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? '#ffe066'
                    : isHovered  ? '#ffffff44'
                    : owner      ? owner.color.primary + '88'
                    : '#1e2a38';
    ctx.lineWidth = isSelected ? 2.5 : (isHovered ? 1.5 : 0.8);
    ctx.stroke();

    // Selection glow
    if (isSelected) {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Terrain icon
    if (S >= 20) {
      ctx.fillStyle = owner ? '#ffffffcc' : '#ffffff88';
      ctx.font      = `${Math.floor(S * 0.42)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(terrDef.symbol, cx, cy - (t.units.length > 0 ? S * 0.18 : 0));
    }

    // Fortification indicator
    if (t.fortification > 0) {
      ctx.fillStyle = '#f0c040dd';
      ctx.font      = `bold ${Math.floor(S * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('◈'.repeat(t.fortification), cx, cy - S * 0.8);
    }

    // Movement range indicator (pulse ring)
    if (isMoveable || isAttack) {
      const ringColor = isAttack ? '#ff4444' : '#00aaff';
      ctx.beginPath();
      ctx.arc(cx, cy, S - 3, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor + '66';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  _drawUnits(t) {
    const ctx = this.ctx;
    const S   = CONFIG.HEX_SIZE;
    const px  = Hex.toPixel(t.q, t.r, S);
    const cx  = px.x, cy = px.y + S * 0.22;

    // Group units by owner
    const byOwner = {};
    for (const u of t.units) {
      if (!byOwner[u.owner]) byOwner[u.owner] = [];
      byOwner[u.owner].push(u);
    }

    const owners = Object.keys(byOwner);
    const slotW  = (S * 1.4) / owners.length;

    owners.forEach((oid, oi) => {
      const units   = byOwner[oid];
      const player  = this.gs.players[parseInt(oid)];
      const sx      = cx - (S * 0.7) + slotW * (oi + 0.5);

      // Count by type
      const byType = {};
      for (const u of units) byType[u.type] = (byType[u.type] || 0) + 1;
      const types  = Object.keys(byType);
      const maxShow = 2;
      const showTypes = types.slice(0, maxShow);

      const dotR = Math.max(6, S * 0.22);
      showTypes.forEach((type, ti) => {
        const dotY = cy - (showTypes.length - 1) * dotR * 0.7 + ti * dotR * 1.4;

        // Shadow
        ctx.beginPath();
        ctx.arc(sx + 1, dotY + 1, dotR, 0, Math.PI * 2);
        ctx.fillStyle = '#00000066';
        ctx.fill();

        // Unit dot
        ctx.beginPath();
        ctx.arc(sx, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = player.color.mid;
        ctx.fill();
        ctx.strokeStyle = player.color.primary;
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Unit icon
        const iconDef = CONFIG.UNITS[type];
        ctx.fillStyle = '#ffffffdd';
        ctx.font      = `${Math.floor(dotR * 1.1)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconDef.icon, sx, dotY);

        // Count badge
        if (byType[type] > 1) {
          ctx.beginPath();
          ctx.arc(sx + dotR * 0.7, dotY - dotR * 0.7, dotR * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = '#111';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.floor(dotR * 0.7)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(byType[type], sx + dotR * 0.7, dotY - dotR * 0.7);
        }
      });

      // If more than maxShow types, show "+N"
      if (types.length > maxShow) {
        ctx.fillStyle = player.color.light;
        ctx.font      = `bold ${Math.floor(S * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${types.length - maxShow}`, sx, cy + dotR * 1.8);
      }
    });
  }

  _drawHoverInfo(t) {
    const ctx = this.ctx;
    const S   = CONFIG.HEX_SIZE;
    const px  = Hex.toPixel(t.q, t.r, S);
    const cx  = px.x, cy = px.y;

    const terrDef = CONFIG.TERRAINS[t.terrain];
    const owner   = t.owner !== null ? this.gs.players[t.owner] : null;
    const res     = terrDef.resources;
    const resStr  = Object.entries(res).map(([k,v]) => `${v}${k[0].toUpperCase()}`).join(' ') || '—';

    const lines = [
      terrDef.name,
      `Owner: ${owner ? owner.name : 'Neutral'}`,
      `Income: ${resStr}`,
      `Defense: +${terrDef.defBonus}${t.fortification > 0 ? ` (fort+${t.fortification*2})` : ''}`,
    ];
    if (t.units.length > 0) {
      const byType = {};
      for (const u of t.units) byType[u.type] = (byType[u.type] || 0) + 1;
      lines.push('Units: ' + Object.entries(byType).map(([k,v]) => `${v}×${CONFIG.UNITS[k].name}`).join(', '));
    }

    const pad = 8, lh = 17, fontSize = 12;
    const w   = 190, h = lines.length * lh + pad * 2;
    let tx     = cx + S + 4, ty = cy - h / 2;

    ctx.fillStyle = '#0d1117ee';
    ctx.strokeStyle = '#2d4060';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, w, h, 4);
    ctx.fill();
    ctx.stroke();

    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#f0c040' : '#c8d8f0';
      ctx.font      = `${i === 0 ? 'bold ' : ''}${fontSize}px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line, tx + pad, ty + pad + i * lh);
    });
  }

  _blendColor(hex1, hex2, t) {
    const p = (h) => [
      parseInt(h.slice(1,3),16),
      parseInt(h.slice(3,5),16),
      parseInt(h.slice(5,7),16),
    ];
    const c1 = p(hex1), c2 = p(hex2);
    const r  = Math.round(c1[0] + (c2[0]-c1[0])*t);
    const g  = Math.round(c1[1] + (c2[1]-c1[1])*t);
    const b  = Math.round(c1[2] + (c2[2]-c1[2])*t);
    return `rgb(${r},${g},${b})`;
  }
}
