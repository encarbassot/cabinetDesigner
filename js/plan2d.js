'use strict';

let plan2dDrag      = null;
let plan2dHover     = null;
let plan2dTransform = null;
let plan2dLabels    = [];
let plan2dLabelDownPos = null;

function resizePlan() {
  const c = document.getElementById('plan-canvas');
  if (!c) return;
  c.width  = Math.max(1, c.offsetWidth);
  c.height = Math.max(1, c.offsetHeight);
}

function drawPlan() {
  const canvas = document.getElementById('plan-canvas');
  if (!canvas) return;
  const W = canvas.width, H = canvas.height;
  if (W < 30 || H < 30) return;

  const ctx   = canvas.getContext('2d');
  const f     = furniture;
  const tw    = totalWidth(f);
  const fh    = f.height;
  const walls = wallXPositions(f);
  const bays  = bayGeometry(f);
  const wood  = currentWood();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#faf7f4';
  ctx.fillRect(0, 0, W, H);
  plan2dLabels = [];

  const PAD_L = 52, PAD_R = 14, PAD_T = 10, PAD_B = 56;
  const areaW = W - PAD_L - PAD_R;
  const areaH = H - PAD_T - PAD_B;
  if (areaW < 10 || areaH < 10) return;

  const scale = Math.min(areaW / tw, areaH / fh);
  const fw  = tw * scale;
  const fh2 = fh * scale;
  const ox  = PAD_L + (areaW - fw) / 2;
  const oy  = PAD_T + (areaH - fh2) / 2;

  const toX = xcm => ox + xcm * scale;
  const toY = ycm => oy + fh2 - ycm * scale;
  plan2dTransform = { scale, ox, oy, fh2 };

  ctx.fillStyle = '#f5f0eb';
  ctx.fillRect(PAD_L, PAD_T, areaW, areaH);
  ctx.strokeStyle = '#e8e2db';
  ctx.lineWidth = 0.5;
  const gridStep = Math.max(10, Math.round(20 * scale) / scale);
  const gridPxStep = gridStep * scale;
  for (let x = ox % gridPxStep; x < W; x += gridPxStep) {
    ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + areaH); ctx.stroke();
  }
  for (let y = oy % gridPxStep; y < H; y += gridPxStep) {
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + areaW, y); ctx.stroke();
  }

  const wH = Math.round(wood.h * 360);
  const wS = Math.round(wood.s * 100);
  const wL = Math.round(wood.l * 100);

  ctx.fillStyle = '#fff';
  ctx.fillRect(ox, oy, fw, fh2);

  ctx.fillStyle = `hsl(${wH},${wS}%,${wL}%)`;
  for (const wc of walls) {
    ctx.fillRect(toX(wc - f.thickness / 2), oy, Math.max(1, f.thickness * scale), fh2);
  }

  for (let b = 0; b < bays.length; b++) {
    const yCentres = slabYCentres(f, b);
    const slabX = toX(walls[b] + f.thickness / 2);
    const slabW = Math.max(0, f.columnWidths[b] * scale);
    const lAdj  = (b % 2) * 4 - 2;
    ctx.fillStyle = `hsl(${wH},${wS}%,${Math.max(0, Math.min(100, wL + lAdj))}%)`;
    for (const yc of yCentres) {
      const slabH = Math.max(1.5, f.thickness * scale);
      ctx.fillRect(slabX, toY(yc + f.thickness / 2), slabW, slabH);
    }
  }

  for (let b = 0; b < bays.length; b++) {
    const yCentres = slabYCentres(f, b);
    const xL = toX(walls[b]     + f.thickness / 2);
    const xR = toX(walls[b + 1] - f.thickness / 2);
    const cW = xR - xL;
    for (let s = 0; s < yCentres.length - 1; s++) {
      const yBot  = yCentres[s]     + f.thickness / 2;
      const yTop  = yCentres[s + 1] - f.thickness / 2;
      const hcm   = Math.round(yTop - yBot);
      const cYTop = toY(yTop);
      const cYBot = toY(yBot);
      const cH    = cYBot - cYTop;
      if (cH < 14 || cW < 24) continue;

      const fs       = Math.max(8, Math.min(11, Math.min(cH / 3.5, cW / 4)));
      const PAD      = 6;
      const arrowX   = xL + PAD + 4;
      const arrowY1  = cYTop + PAD;
      const arrowY2  = cYBot - PAD;
      const arrowSpan = arrowY2 - arrowY1;
      const ah       = Math.max(4, Math.min(6, arrowSpan * 0.14));

      ctx.strokeStyle  = '#a09488';
      ctx.fillStyle    = '#a09488';
      ctx.lineWidth    = 0.9;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `${fs}px system-ui,sans-serif`;

      if (arrowSpan >= 16) {
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY1 + ah);
        ctx.lineTo(arrowX, arrowY2 - ah);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY1);
        ctx.lineTo(arrowX - ah * 0.7, arrowY1 + ah);
        ctx.lineTo(arrowX + ah * 0.7, arrowY1 + ah);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY2);
        ctx.lineTo(arrowX - ah * 0.7, arrowY2 - ah);
        ctx.lineTo(arrowX + ah * 0.7, arrowY2 - ah);
        ctx.closePath(); ctx.fill();
      }

      ctx.fillStyle = '#7a6c64';
      ctx.fillText(hcm + ' cm', arrowX + ah + 4, (cYTop + cYBot) / 2);
      plan2dLabels.push({ type: 'compartment', bayIdx: b, relIdx: s,
        cx: arrowX + ah + 4 + 22, cy: (cYTop + cYBot) / 2, value: hcm });
    }
  }

  if (plan2dHover) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    if (plan2dHover.type === 'wall') {
      ctx.fillStyle = '#2255cc';
      const wi = plan2dHover.wallIdx;
      ctx.fillRect(toX(walls[wi] - f.thickness / 2), oy, Math.max(2, f.thickness * scale), fh2);
    } else {
      ctx.fillStyle = '#116633';
      const { bayIdx, slabIdx } = plan2dHover;
      const group = [{ bay: bayIdx, relIdx: slabIdx - 1 }, ...getLinkedChain(bayIdx, slabIdx - 1)];
      for (const { bay, relIdx } of group) {
        const si = relIdx + 1;
        const yCentres2 = slabYCentres(f, bay);
        if (si >= yCentres2.length) continue;
        const yc    = yCentres2[si];
        const slabX = toX(walls[bay] + f.thickness / 2);
        const slabW = Math.max(0, f.columnWidths[bay] * scale);
        ctx.fillRect(slabX, toY(yc + f.thickness / 2), slabW, Math.max(2, f.thickness * scale));
      }
    }
    ctx.restore();
  }

  if (plan2dDrag?.snapTarget) {
    const st = plan2dDrag.snapTarget;
    if (plan2dDrag.type === 'slab' && !plan2dDrag.isTopSlab) {
      if (st.type === 'crossbay') {
        ctx.save();
        ctx.strokeStyle = '#dd7700';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(ox, toY(st.absY));
        ctx.lineTo(ox + fw, toY(st.absY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      const bayX = bays[plan2dDrag.bayIdx].xCentre;
      drawSnapBalls2D(ctx, { scale, ox, oy, fh2 }, bayX, st.lowerY, bayX, st.upperY);
    } else if (plan2dDrag.type === 'wall' && st.lowerX !== undefined) {
      drawSnapBalls2D(ctx, { scale, ox, oy, fh2 }, st.lowerX, f.height / 2, st.upperX, f.height / 2);
    }
  }

  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + 0.75, oy + 0.75, fw - 1.5, fh2 - 1.5);

  ctx.strokeStyle = 'rgba(90,60,30,0.25)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < walls.length - 1; i++) {
    const x = toX(walls[i]);
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + fh2); ctx.stroke();
  }

  const minBayPx = Math.min(...bays.map((_, b) => toX(walls[b+1] - f.thickness/2) - toX(walls[b] + f.thickness/2)));
  const FS = Math.max(8, Math.min(11, minBayPx / 5));
  ctx.font = `${FS}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const dimBaseY = oy + fh2 + 4;

  for (let b = 0; b < bays.length; b++) {
    const xL   = toX(walls[b] + f.thickness / 2);
    const xR   = toX(walls[b + 1] - f.thickness / 2);
    const xMid = (xL + xR) / 2;
    if (xR - xL < 8) continue;

    ctx.strokeStyle = '#d0c8c0';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(xL, oy + fh2); ctx.lineTo(xL, dimBaseY + 8);
    ctx.moveTo(xR, oy + fh2); ctx.lineTo(xR, dimBaseY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#b0a49a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(xL, dimBaseY + 4); ctx.lineTo(xR, dimBaseY + 4);
    ctx.moveTo(xL, dimBaseY);     ctx.lineTo(xL, dimBaseY + 8);
    ctx.moveTo(xR, dimBaseY);     ctx.lineTo(xR, dimBaseY + 8);
    ctx.stroke();

    ctx.fillStyle = '#5a4c44';
    ctx.fillText(f.columnWidths[b] + ' cm', xMid, dimBaseY + 10);
    plan2dLabels.push({ type: 'bayWidth', bayIdx: b, cx: xMid, cy: dimBaseY + 10 + FS / 2, value: f.columnWidths[b] });
  }

  const totalWDimY = dimBaseY + FS + 14;
  if (totalWDimY + 10 < H) {
    ctx.strokeStyle = '#7a6050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, totalWDimY + 4); ctx.lineTo(ox + fw, totalWDimY + 4);
    ctx.moveTo(ox, totalWDimY);     ctx.lineTo(ox, totalWDimY + 8);
    ctx.moveTo(ox + fw, totalWDimY); ctx.lineTo(ox + fw, totalWDimY + 8);
    ctx.stroke();
    ctx.fillStyle = '#2a1c10';
    ctx.font = `bold ${Math.max(9, Math.min(11, FS))}px system-ui,sans-serif`;
    ctx.fillText(Math.round(tw) + ' cm', ox + fw / 2, totalWDimY + 9);
  }

  const hDimX = ox - 30;
  if (hDimX > 0) {
    ctx.strokeStyle = '#7a6050';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hDimX, oy);       ctx.lineTo(hDimX, oy + fh2);
    ctx.moveTo(hDimX - 4, oy);   ctx.lineTo(hDimX + 4, oy);
    ctx.moveTo(hDimX - 4, oy + fh2); ctx.lineTo(hDimX + 4, oy + fh2);
    ctx.stroke();
    ctx.save();
    ctx.translate(hDimX - 8, oy + fh2 / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${Math.max(9, Math.min(11, FS))}px system-ui,sans-serif`;
    ctx.fillStyle = '#2a1c10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.height + ' cm', 0, 0);
    ctx.restore();
    plan2dLabels.push({ type: 'totalHeight', cx: hDimX - 8, cy: oy + fh2 / 2, value: f.height });
  }
}

function showPlan2dLabel(region) {
  const inp    = document.getElementById('plan2d-label-input');
  const canvas = document.getElementById('plan-canvas');
  const view   = document.getElementById('view-2d');
  const cRect  = canvas.getBoundingClientRect();
  const vRect  = view.getBoundingClientRect();
  inp.style.left = Math.max(2, cRect.left - vRect.left + region.cx - 36) + 'px';
  inp.style.top  = Math.max(2, cRect.top  - vRect.top  + region.cy - 13) + 'px';
  inp._region    = region;
  inp.value      = region.value;
  inp.style.display = 'block';
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
}

function commitPlan2dLabel() {
  const inp    = document.getElementById('plan2d-label-input');
  const region = inp._region;
  if (!region) return;
  inp._region = null;
  inp.style.display = 'none';
  const val = Math.round(parseFloat(inp.value));
  if (isNaN(val) || val < 1) return;
  const f = furniture;
  if (region.type === 'totalHeight') {
    f.height = Math.max(30, val);
    const cfgH = document.getElementById('cfg-height'); if (cfgH) cfgH.value = f.height;
  } else if (region.type === 'bayWidth') {
    f.columnWidths[region.bayIdx] = Math.max(5, val);
    updateColumnsUI();
  } else if (region.type === 'compartment') {
    const b = region.bayIdx, s = region.relIdx;
    const yCentres = slabYCentres(f, b);
    if (!yCentres || s >= yCentres.length - 1) { buildFurniture(); return; }
    const rels    = f.columnSlabs[b];
    const ri      = s;
    const oldAbsY = getSlabAbsY(f, b, ri);
    const oldRel  = rels[ri];
    const nextRel = ri + 1 < rels.length ? rels[ri + 1] : null;
    const lb      = (oldAbsY - oldRel) + f.thickness;
    const ub      = nextRel !== null ? oldAbsY + nextRel - Math.max(f.thickness, 1) : f.height - f.thickness * 2;
    const newAbsY = clamp((yCentres[s] + f.thickness / 2) + val, lb, ub);
    const newRel  = Math.max(1, Math.round(newAbsY - (oldAbsY - oldRel)));
    f.columnSlabs[b][ri] = newRel;
    if (nextRel !== null)
      f.columnSlabs[b][ri + 1] = Math.max(1, nextRel - (newRel - oldRel));
  }
  buildFurniture();
}

function plan2dHitTest(mx, my) {
  if (!plan2dTransform) return null;
  const { scale, ox, oy, fh2 } = plan2dTransform;
  const f = furniture, t = f.thickness;
  const walls = wallXPositions(f);
  const HIT = 7;

  for (let wi = 0; wi < walls.length; wi++) {
    const px = ox + walls[wi] * scale;
    if (mx >= px - t * scale / 2 - HIT && mx <= px + t * scale / 2 + HIT &&
        my >= oy && my <= oy + fh2)
      return { type: 'wall', wallIdx: wi };
  }

  for (let b = 0; b < numBays(f); b++) {
    const yCentres = slabYCentres(f, b);
    const slabX = ox + (walls[b] + t / 2) * scale;
    const slabW = f.columnWidths[b] * scale;
    for (let s = 1; s < yCentres.length; s++) {
      const py  = oy + fh2 - yCentres[s] * scale;
      const pHH = Math.max(HIT, t * scale / 2 + 2);
      if (mx >= slabX - HIT && mx <= slabX + slabW + HIT &&
          my >= py - pHH   && my <= py + pHH)
        return { type: 'slab', bayIdx: b, slabIdx: s, totalSlabs: yCentres.length };
    }
  }
  return null;
}

(function initPlan2dDrag() {
  const canvas = document.getElementById('plan-canvas');

  canvas.addEventListener('mousemove', e => {
    if (activeView !== '2d' || plan2dDrag) return;
    const rect = canvas.getBoundingClientRect();
    const hit  = plan2dHitTest(e.clientX - rect.left, e.clientY - rect.top);
    const same = hit?.type === plan2dHover?.type &&
                 hit?.wallIdx === plan2dHover?.wallIdx &&
                 hit?.bayIdx  === plan2dHover?.bayIdx  &&
                 hit?.slabIdx === plan2dHover?.slabIdx;
    if (!same) { plan2dHover = hit; drawPlan(); }
    canvas.style.cursor = hit ? (hit.type === 'wall' ? 'ew-resize' : 'ns-resize') : 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (plan2dHover) { plan2dHover = null; drawPlan(); }
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mousedown', e => {
    const _inp = document.getElementById('plan2d-label-input');
    if (_inp._region) commitPlan2dLabel();
    plan2dLabelDownPos = { x: e.clientX, y: e.clientY };
    if (activeView !== '2d' || e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const hit  = plan2dHitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    e.preventDefault();
    const { scale } = plan2dTransform;
    const f = furniture;

    if (hit.type === 'wall') {
      const wi = hit.wallIdx;
      if (lockedDimensions.width && (wi === 0 || wi === numWalls(f) - 1)) return;
      const wState = wallDragStart(f, wi);
      plan2dDrag = { type: 'wall', startClientX: e.clientX, scale, ...wState };
      canvas.style.cursor = 'ew-resize';
      return;
    }

    const { bayIdx, slabIdx, totalSlabs } = hit;
    if (slabIdx === totalSlabs - 1) {
      if (lockedDimensions.height) return;
      plan2dDrag = { type: 'slab', isTopSlab: true,
        startClientY: e.clientY, scale, startHeight: f.height, lb: 30 };
    } else {
      const ri     = slabIdx - 1;
      const sState = slabDragStart(f, bayIdx, ri);
      plan2dDrag = { type: 'slab', startClientY: e.clientY, scale, ...sState };
    }
    canvas.style.cursor = 'ns-resize';
  });

  canvas.addEventListener('click', e => {
    if (activeView !== '2d' || !plan2dLabelDownPos) return;
    const dx = e.clientX - plan2dLabelDownPos.x;
    const dy = e.clientY - plan2dLabelDownPos.y;
    if (dx * dx + dy * dy > 16) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestD2 = 22 * 22;
    for (const lbl of plan2dLabels) {
      const d2 = (mx - lbl.cx) ** 2 + (my - lbl.cy) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = lbl; }
    }
    if (best) showPlan2dLabel(best);
  });

  canvas.addEventListener('touchstart', e => {
    if (activeView !== '2d') return;
    const t = e.touches[0];
    if (!t) return;
    e.preventDefault();
    plan2dLabelDownPos = { x: t.clientX, y: t.clientY };
    const _inp = document.getElementById('plan2d-label-input');
    if (_inp._region) commitPlan2dLabel();
    const rect = canvas.getBoundingClientRect();
    const hit  = plan2dHitTest(t.clientX - rect.left, t.clientY - rect.top);
    if (!hit) return;
    const { scale } = plan2dTransform;
    const f = furniture;
    if (hit.type === 'wall') {
      const wi = hit.wallIdx;
      if (lockedDimensions.width && (wi === 0 || wi === numWalls(f) - 1)) return;
      const wState = wallDragStart(f, wi);
      plan2dDrag = { type: 'wall', startClientX: t.clientX, scale, ...wState };
    } else {
      const { bayIdx, slabIdx, totalSlabs } = hit;
      if (slabIdx === totalSlabs - 1) {
        if (lockedDimensions.height) return;
        plan2dDrag = { type: 'slab', isTopSlab: true,
          startClientY: t.clientY, scale, startHeight: f.height, lb: 30 };
      } else {
        const ri     = slabIdx - 1;
        const sState = slabDragStart(f, bayIdx, ri);
        plan2dDrag = { type: 'slab', startClientY: t.clientY, scale, ...sState };
      }
    }
  }, { passive: false });

  const labelInp = document.getElementById('plan2d-label-input');
  labelInp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitPlan2dLabel(); }
    if (e.key === 'Escape') { labelInp._region = null; labelInp.style.display = 'none'; }
  });
  labelInp.addEventListener('blur', () => commitPlan2dLabel());
})();
