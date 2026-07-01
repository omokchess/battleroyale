/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Free-canvas drag-snap block editor (Scratch/Entry-style) for weapon gimmicks.
 * Blocks are absolutely-positioned DOM nodes on a scrollable canvas: hat (event)
 * blocks start a stack, statement blocks snap top→bottom, and C-blocks (if /
 * repeat / repeatVar) nest a child stack in a mouth. Dragging a block carries its
 * whole sub-stack; dropping near a connector snaps in (inserting if occupied).
 * The graph serializes to the same AST BlockVM runs — and the host VM always
 * re-sanitizes + clamps it, so the editor is convenience, not a trust boundary.
 */

import { BlockVM, VM_LIMITS, countBlocks, EVENTS } from './BlockVM.js';

const EVENT_LABEL = {
  basicAttack: '평타 시', skillF: 'F스킬 시', skillR: 'R 시', lmb: 'LMB 시',
  charging: '충전 중', chargeRelease: '충전 해제 시', onHit: '명중 시', onHurt: '피격 시',
  onKill: '처치 시', onJump: '점프 시', onLand: '착지 시', onRespawn: '부활 시', onTick: '매 틱',
  projectileHit: '투사체 명중 시', placementTrigger: '설치물 발동 시',
};
const P = (key, kind, def, opts) => ({ key, kind, def, opts });
const BLOCK_DEFS = {
  // events (hat)
  ...Object.fromEntries([...EVENTS].map(e => [e, { cat: 'event', label: EVENT_LABEL[e] || e, hat: true, params: (e === 'projectileHit' || e === 'placementTrigger') ? [P('tag', 'text', '')] : [] }])),
  // actions
  spawnProjectile: { cat: 'action', label: '투사체 발사', params: [P('angle', 'angle', 0), P('speed', 'num', 520), P('range', 'num', 280), P('damagePct', 'pct', 90), P('tag', 'text', ''), P('pierce', 'bool', false)] },
  spawnMelee: { cat: 'action', label: '근접 판정', params: [P('frontOffset', 'num', 60), P('width', 'num', 50), P('height', 'num', 44), P('damagePct', 'pct', 100)] },
  spawnArea: { cat: 'action', label: '범위 판정', params: [P('radius', 'num', 60), P('damagePct', 'pct', 70)] },
  applyStatus: { cat: 'action', label: '상태이상', params: [P('status', 'select', 'burn', ['bleed', 'burn', 'slow', 'stun']), P('durationMs', 'num', 1000)] },
  knockback: { cat: 'action', label: '넉백', params: [P('force', 'num', 80)] },
  heal: { cat: 'action', label: '회복', params: [P('ofLastDamagePct', 'pct', 20), P('amountPct', 'pct', 0)] },
  dash: { cat: 'action', label: '대시', params: [P('angle', 'angle', 0), P('distance', 'num', 120)] },
  teleport: { cat: 'action', label: '텔레포트', params: [P('distance', 'num', 120)] },
  jump: { cat: 'action', label: '점프', params: [P('power', 'num', 1)] },
  pull: { cat: 'action', label: '끌어오기', params: [P('distance', 'num', 120)] },
  particle: { cat: 'action', label: '파티클', params: [P('id', 'select', 'explosion', ['explosion', 'danger_pop'])] },
  sfx: { cat: 'action', label: '사운드', params: [P('id', 'select', 'shoot', ['shoot', 'hit', 'slash', 'slam', 'explosion'])] },
  shake: { cat: 'action', label: '흔들림', params: [P('level', 'select', 'weak', ['weak', 'strong'])] },
  setVar: { cat: 'action', label: '변수 설정', params: [P('var', 'text', 'charge'), P('value', 'num', 0)] },
  // control (C-blocks)
  if: { cat: 'control', label: '만약', params: [], cond: true, containers: ['then', 'else'] },
  repeat: { cat: 'control', label: '반복', params: [P('count', 'num', 3)], containers: ['body'] },
  repeatVar: { cat: 'control', label: 'i를 a..b', params: [P('var', 'text', 'i'), P('from', 'num', -1), P('to', 'num', 1)], containers: ['body'] },
  wait: { cat: 'control', label: '대기(ms)', params: [P('ms', 'num', 200)] },
  stop: { cat: 'control', label: '정지', params: [] },
};
const CATS = [['event', '이벤트'], ['action', '동작'], ['control', '제어']];
const CMP = [['lt', '<'], ['le', '≤'], ['eq', '='], ['ge', '≥'], ['gt', '>']];
const SENSE = [['nearestDist', '적 거리'], ['myHp', '내 HP'], ['charge', '충전량'], ['mySpeed', '속도'], ['combo', '콤보']];
const COL = { event: '#7df09a', action: '#45f3ff', control: '#c9a227' };

const HDR = 30, INDENT = 16, MOUTH_MIN = 22, FOOT = 8, SNAP = 40;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class BlockEditor {
  constructor() {
    this.root = document.getElementById('blockEditor');
    if (!this.root) return;
    this.ws = document.getElementById('beWorkspace');
    this.blocks = new Map();
    this.seq = 0; this.tier = 'workshop'; this.onSave = null;
    this.drag = null;
    document.getElementById('beClose')?.addEventListener('click', () => this.close());
    document.getElementById('beSave')?.addEventListener('click', () => { this.onSave?.(this.buildAST()); this._status('저장됨. 무기 저장 시 함께 적용됩니다.'); });
    document.getElementById('beTest')?.addEventListener('click', () => this._test());
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => this._up());
    // Event-tab row is repurposed as a hint in the free-canvas editor.
    const tabs = document.getElementById('beEventTabs'); if (tabs) tabs.innerHTML = '<span class="text-[10px] text-gray-500">팔레트에서 블록을 캔버스로 끌어놓고, 위·아래로 붙이세요. 초록 = 이벤트(시작)</span>';
  }

  open(ast, tier = 'workshop', onSave = null) {
    if (!this.root) return;
    this.tier = VM_LIMITS[tier] ? tier : 'workshop';
    this.onSave = onSave;
    this.blocks.clear(); this.seq = 0;
    document.getElementById('beBlockMax').textContent = VM_LIMITS[this.tier].maxBlocks;
    this._import(ast);
    if (!this.blocks.size) this._newBlock('basicAttack', 30, 24);
    this._renderPalette();
    this._layoutAndRender();
    this.root.classList.remove('hidden');
  }
  close() { this.root?.classList.add('hidden'); }

  // ── palette ──
  _renderPalette() {
    const el = document.getElementById('bePalette'); if (!el) return;
    let html = '';
    for (const [cat, label] of CATS) {
      html += `<div class="text-[10px] text-gray-400 uppercase mt-1 mb-1">${label}</div>`;
      for (const op in BLOCK_DEFS) if (BLOCK_DEFS[op].cat === cat) {
        html += `<button data-op="${op}" class="block w-full text-left mb-1 px-2 py-1 text-[11px] border cursor-grab active:cursor-grabbing" style="border-color:${COL[cat]};color:${COL[cat]}">${BLOCK_DEFS[op].hat ? '▸ ' : ''}${BLOCK_DEFS[op].label}</button>`;
      }
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-op]').forEach(b => b.addEventListener('pointerdown', (e) => this._paletteDown(e, b.dataset.op)));
  }

  _paletteDown(e, op) {
    e.preventDefault();
    if (countBlocks(this.buildAST()) >= VM_LIMITS[this.tier].maxBlocks) { this._status('블록 한계 도달.'); return; }
    const r = this.ws.getBoundingClientRect();
    const x = e.clientX - r.left + this.ws.scrollLeft - 40, y = e.clientY - r.top + this.ws.scrollTop - 12;
    const id = this._newBlock(op, Math.max(4, x), Math.max(4, y));
    this._layoutAndRender();
    this._startDrag(id, e.clientX, e.clientY);
  }

  // ── block model ──
  _newBlock(op, x, y) {
    const def = BLOCK_DEFS[op]; const id = 'b' + (++this.seq);
    const b = { id, op, x, y, next: null, body: null, elseBody: null };
    for (const p of def.params) b[p.key] = (p.kind === 'angle') ? { op: 'add', a: { op: 'aimAngle' }, b: 0 } : p.def;
    if (def.cond) b.cond = { op: 'lt', a: { op: 'nearestDist' }, b: 90 };
    this.blocks.set(id, b);
    return id;
  }
  _parentOf(id) {
    for (const b of this.blocks.values()) { if (b.next === id) return { p: b, slot: 'next' }; if (b.body === id) return { p: b, slot: 'body' }; if (b.elseBody === id) return { p: b, slot: 'elseBody' }; }
    return null;
  }
  _tail(id) { let b = this.blocks.get(id); while (b.next) b = this.blocks.get(b.next); return b; }
  _inSubtree(rootId, targetId) { if (rootId === targetId) return true; const b = this.blocks.get(rootId); if (!b) return false; return [b.next, b.body, b.elseBody].some(c => c && this._inSubtree(c, targetId)); }
  _delete(id) { const b = this.blocks.get(id); if (!b) return; for (const c of [b.next, b.body, b.elseBody]) if (c) this._delete(c); this.blocks.get(id)?._dom && Object.values(b._dom).forEach(el => el?.remove()); this.blocks.delete(id); }

  // ── layout (compute x,y for every block; returns stack bottom) ──
  _layoutStack(id, x, y) {
    while (id) {
      const b = this.blocks.get(id); b.x = x; b.y = y;
      const def = BLOCK_DEFS[b.op];
      if (def.containers) {
        let cy = y + HDR;
        const bBottom = b.body ? this._layoutStack(b.body, x + INDENT, cy) : cy + MOUTH_MIN;
        b._mouthH = bBottom - cy;
        let by = bBottom + FOOT;
        if (def.containers.includes('else')) {
          b._elseY = by; by += HDR;
          const eBottom = b.elseBody ? this._layoutStack(b.elseBody, x + INDENT, by) : by + MOUTH_MIN;
          b._elseMouthH = eBottom - by;
          by = eBottom + FOOT;
        }
        y = by;
      } else { b._mouthH = 0; y += HDR; }
      id = b.next;
    }
    return y;
  }

  _layoutAndRender() {
    let maxX = 400, maxY = 300;
    for (const b of this.blocks.values()) if (!this._parentOf(b.id)) { const bottom = this._layoutStack(b.id, b.x, b.y); maxY = Math.max(maxY, bottom + 60); maxX = Math.max(maxX, b.x + 340); }
    this.ws.style.position = 'relative'; this.ws.style.minWidth = maxX + 'px'; this.ws.style.minHeight = maxY + 'px';
    for (const b of this.blocks.values()) this._renderBlock(b);
    this._gauge();
  }

  _renderBlock(b) {
    const def = BLOCK_DEFS[b.op];
    if (!b._dom) b._dom = {};
    let h = b._dom.header;
    if (!h) {
      h = b._dom.header = document.createElement('div');
      h.className = 'be-blk'; h.style.position = 'absolute'; h.style.whiteSpace = 'nowrap';
      h.style.borderLeft = `4px solid ${COL[def.cat]}`; h.style.background = '#1b1b22'; h.style.padding = '4px 6px';
      h.style.font = '11px monospace'; h.style.cursor = 'grab'; h.style.zIndex = '2'; h.style.userSelect = 'none';
      const head = document.createElement('span'); head.style.color = COL[def.cat]; head.textContent = (def.hat ? '▸ ' : '') + def.label; head.style.marginRight = '4px';
      h.appendChild(head);
      for (const p of def.params) h.appendChild(this._param(b, p));
      if (def.cond) h.appendChild(this._condWidget(b));
      const del = document.createElement('button'); del.textContent = '✕'; del.style.marginLeft = '6px'; del.style.color = '#888'; del.style.cursor = 'pointer';
      del.addEventListener('pointerdown', (e) => { e.stopPropagation(); const par = this._parentOf(b.id); if (par) par.p[par.slot] = b.next; this._delete(b.id); this._layoutAndRender(); });
      h.appendChild(del);
      h.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return; e.preventDefault(); this._startDrag(b.id, e.clientX, e.clientY); });
      this.ws.appendChild(h);
    }
    h.style.left = b.x + 'px'; h.style.top = b.y + 'px';
    // C-block mouth accent + footer
    if (def.containers) {
      const mk = (key, top, height) => { let el = b._dom[key]; if (!el) { el = b._dom[key] = document.createElement('div'); el.style.position = 'absolute'; el.style.width = (INDENT - 2) + 'px'; el.style.background = COL[def.cat]; el.style.opacity = '0.35'; el.style.zIndex = '1'; this.ws.appendChild(el); } el.style.left = b.x + 'px'; el.style.top = top + 'px'; el.style.height = Math.max(6, height) + 'px'; };
      mk('mouth', b.y + HDR, b._mouthH);
      if (def.containers.includes('else')) {
        let eh = b._dom.elseHdr; if (!eh) { eh = b._dom.elseHdr = document.createElement('div'); eh.style.position = 'absolute'; eh.style.font = '10px monospace'; eh.style.color = COL[def.cat]; eh.textContent = '아니면'; eh.style.zIndex = '2'; this.ws.appendChild(eh); }
        eh.style.left = b.x + 'px'; eh.style.top = b._elseY + 'px';
        mk('elseMouth', b._elseY + HDR, b._elseMouthH);
      }
    }
  }

  // ── drag + snap ──
  _startDrag(id, cx, cy) {
    const par = this._parentOf(id); if (par) par.p[par.slot] = null;   // detach from parent
    const b = this.blocks.get(id);
    this.drag = { id, offX: cx - (this.ws.getBoundingClientRect().left - this.ws.scrollLeft + b.x), offY: cy - (this.ws.getBoundingClientRect().top - this.ws.scrollTop + b.y) };
    b._dom.header.style.zIndex = '10'; b._dom.header.style.cursor = 'grabbing';
    this._layoutAndRender();
  }
  _move(e) {
    if (!this.drag) return;
    const r = this.ws.getBoundingClientRect();
    const b = this.blocks.get(this.drag.id);
    b.x = Math.max(2, e.clientX - r.left + this.ws.scrollLeft - this.drag.offX);
    b.y = Math.max(2, e.clientY - r.top + this.ws.scrollTop - this.drag.offY);
    this._layoutStack(b.id, b.x, b.y);
    for (const bb of this.blocks.values()) if (this._inSubtree(this.drag.id, bb.id)) this._renderBlock(bb);
    this._highlightSnap();
  }
  _up() {
    if (!this.drag) return;
    const id = this.drag.id; this.drag = null;
    const target = this._findSnap(id);
    if (target) { const old = target.p[target.slot]; target.p[target.slot] = id; if (old) this._tail(id).next = old; }
    this.blocks.get(id)._dom.header.style.zIndex = '2'; this.blocks.get(id)._dom.header.style.cursor = 'grab';
    if (this._snapMark) { this._snapMark.remove(); this._snapMark = null; }
    this._layoutAndRender();
  }
  // Connection points on every block NOT in the dragged subtree: bottom(next),
  // mouth-top(body), else-mouth-top(elseBody). Nearest to the dragged top wins.
  _connectors(exceptId) {
    const out = [];
    for (const b of this.blocks.values()) {
      if (this._inSubtree(exceptId, b.id)) continue;
      const def = BLOCK_DEFS[b.op];
      if (!b.next) out.push({ p: b, slot: 'next', x: b.x, y: b.y + (def.containers ? this._blockFullH(b) : HDR) });
      if (def.containers) { if (!b.body) out.push({ p: b, slot: 'body', x: b.x + INDENT, y: b.y + HDR }); if (def.containers.includes('else') && !b.elseBody) out.push({ p: b, slot: 'elseBody', x: b.x + INDENT, y: b._elseY + HDR }); }
    }
    return out;
  }
  _blockFullH(b) { const def = BLOCK_DEFS[b.op]; if (!def.containers) return HDR; let h = HDR + (b._mouthH || MOUTH_MIN) + FOOT; if (def.containers.includes('else')) h += HDR + (b._elseMouthH || MOUTH_MIN) + FOOT; return h; }
  _findSnap(id) {
    const b = this.blocks.get(id);
    let best = null, bd = SNAP * SNAP;
    for (const c of this._connectors(id)) { const d = (c.x - b.x) ** 2 + (c.y - b.y) ** 2; if (d < bd) { bd = d; best = c; } }
    // a hat block can't snap under anything (it starts a stack)
    return (best && !BLOCK_DEFS[b.op].hat) ? best : null;
  }
  _highlightSnap() {
    const c = this._findSnap(this.drag.id);
    if (!this._snapMark) { this._snapMark = document.createElement('div'); this._snapMark.style.position = 'absolute'; this._snapMark.style.height = '3px'; this._snapMark.style.width = '120px'; this._snapMark.style.background = '#ffd24a'; this._snapMark.style.zIndex = '9'; this.ws.appendChild(this._snapMark); }
    this._snapMark.style.display = c ? 'block' : 'none';
    if (c) { this._snapMark.style.left = c.x + 'px'; this._snapMark.style.top = (c.y - 1) + 'px'; }
  }

  // ── param widgets (edit AST in place) ──
  _param(b, p) {
    const span = document.createElement('span'); span.style.marginRight = '3px';
    const stop = (el) => { el.addEventListener('pointerdown', e => e.stopPropagation()); return el; };
    if (p.kind === 'bool') { const cb = stop(document.createElement('input')); cb.type = 'checkbox'; cb.checked = !!b[p.key]; cb.addEventListener('change', () => b[p.key] = cb.checked); span.append(this._lbl(p.key), cb); return span; }
    if (p.kind === 'select') { const s = stop(document.createElement('select')); s.style.font = '10px monospace'; s.innerHTML = p.opts.map(o => `<option ${b[p.key] === o ? 'selected' : ''}>${o}</option>`).join(''); s.addEventListener('change', () => b[p.key] = s.value); span.append(this._lbl(p.key), s); return span; }
    if (p.kind === 'text') { const i = stop(document.createElement('input')); i.type = 'text'; i.maxLength = 16; i.value = b[p.key] ?? ''; i.style.width = '52px'; i.style.font = '10px monospace'; i.addEventListener('input', () => b[p.key] = i.value.slice(0, 16)); span.append(this._lbl(p.key), i); return span; }
    if (p.kind === 'angle') {
      const cur = b[p.key] || { op: 'add', a: { op: 'aimAngle' }, b: 0 }; const bb = cur.b; const perI = !!(bb && bb.op === 'mul'); const off = perI ? (bb.b || 0) : (typeof bb === 'number' ? bb : 0);
      const num = stop(document.createElement('input')); num.type = 'number'; num.value = off; num.style.width = '44px'; num.style.font = '10px monospace';
      const chk = stop(document.createElement('input')); chk.type = 'checkbox'; chk.checked = perI;
      const w = () => { const v = Number(num.value) || 0; b[p.key] = { op: 'add', a: { op: 'aimAngle' }, b: chk.checked ? { op: 'mul', a: { var: 'i' }, b: v } : v }; };
      num.addEventListener('input', w); chk.addEventListener('change', w);
      span.append(this._lbl('조준각+'), num, this._lbl('°×i'), chk); return span;
    }
    const i = stop(document.createElement('input')); i.type = 'number'; i.value = typeof b[p.key] === 'number' ? b[p.key] : (p.def || 0); i.style.width = '52px'; i.style.font = '10px monospace';
    i.addEventListener('input', () => b[p.key] = Number(i.value) || 0);
    span.append(this._lbl(p.key + (p.kind === 'pct' ? '%' : '')), i); return span;
  }
  _condWidget(b) {
    const span = document.createElement('span'); const stop = (el) => { el.addEventListener('pointerdown', e => e.stopPropagation()); return el; };
    const c = b.cond = b.cond || { op: 'lt', a: { op: 'nearestDist' }, b: 90 };
    const sense = stop(document.createElement('select')); sense.style.font = '10px monospace'; sense.innerHTML = SENSE.map(([o, l]) => `<option value="${o}" ${c.a?.op === o ? 'selected' : ''}>${l}</option>`).join('');
    const cmp = stop(document.createElement('select')); cmp.style.font = '10px monospace'; cmp.innerHTML = CMP.map(([o, l]) => `<option value="${o}" ${c.op === o ? 'selected' : ''}>${l}</option>`).join('');
    const num = stop(document.createElement('input')); num.type = 'number'; num.value = typeof c.b === 'number' ? c.b : 0; num.style.width = '44px'; num.style.font = '10px monospace';
    const w = () => b.cond = { op: cmp.value, a: { op: sense.value }, b: Number(num.value) || 0 };
    sense.addEventListener('change', w); cmp.addEventListener('change', w); num.addEventListener('input', w);
    span.append(sense, cmp, num); return span;
  }
  _lbl(t) { const s = document.createElement('span'); s.style.color = '#888'; s.textContent = t; s.style.margin = '0 2px'; return s; }

  // ── serialize graph → AST ──
  buildAST() {
    const events = [];
    for (const b of this.blocks.values()) if (!this._parentOf(b.id) && EVENTS.has(b.op)) events.push({ on: b.op, tag: b.tag || undefined, do: this._chain(b.next) });
    return { events };
  }
  _chain(id) { const out = []; while (id) { const b = this.blocks.get(id); out.push(this._stmt(b)); id = b.next; } return out; }
  _stmt(b) {
    const def = BLOCK_DEFS[b.op]; const s = { op: b.op };
    for (const p of def.params) if (b.op !== 'projectileHit' && b.op !== 'placementTrigger') s[p.key] = b[p.key];
    if (def.cond) s.cond = b.cond;
    if (def.containers) for (const c of def.containers) s[c] = this._chain(c === 'else' ? b.elseBody : b.body);
    return s;
  }

  _import(ast) {
    if (!ast || !Array.isArray(ast.events)) return;
    let y = 20;
    for (const ev of ast.events) {
      if (!EVENTS.has(ev.on)) continue;
      const hatId = this._newBlock(ev.on, 30, y);
      if (ev.tag) this.blocks.get(hatId).tag = String(ev.tag);
      this.blocks.get(hatId).next = this._importChain(ev.do);
      y += 40 + (this._layoutStack(hatId, 30, y) - y) + 30;
    }
  }
  _importChain(arr) {
    let firstId = null, prevId = null;
    for (const st of arr || []) {
      if (!BLOCK_DEFS[st.op]) continue;
      const id = this._newBlock(st.op, 0, 0); const b = this.blocks.get(id);
      const def = BLOCK_DEFS[st.op];
      for (const p of def.params) if (st[p.key] !== undefined) b[p.key] = st[p.key];
      if (def.cond && st.cond) b.cond = st.cond;
      if (def.containers) { b.body = this._importChain(st.then || st.body); if (def.containers.includes('else')) b.elseBody = this._importChain(st.else); }
      if (!firstId) firstId = id; if (prevId) this.blocks.get(prevId).next = id; prevId = id;
    }
    return firstId;
  }

  _gauge() {
    const n = countBlocks(this.buildAST()), max = VM_LIMITS[this.tier].maxBlocks;
    const g = document.getElementById('beBlockGauge'); if (g) g.textContent = n;
    const bar = document.getElementById('beBlockBar'); if (bar) { bar.style.width = Math.min(100, n / max * 100) + '%'; bar.style.background = n > max ? '#ff5a5a' : n > max * 0.85 ? '#ffd24a' : '#7df09a'; }
    const cnt = document.getElementById('meBlockCount'); if (cnt) cnt.textContent = n ? `(${n} 블록)` : '';
  }

  _test() {
    const vm = new BlockVM(this.buildAST(), this.tier);
    const events = this.buildAST().events; const ev = events[0];
    if (!ev) { this._status('실행할 이벤트 블록이 없습니다.'); return; }
    const calls = []; const api = {}; for (const n of ['spawnMelee', 'spawnProjectile', 'spawnArea', 'applyStatus', 'knockback', 'heal', 'dash', 'teleport', 'jump', 'pull', 'spawnPlacement', 'particle', 'sfx', 'shake', 'cooldownGate']) api[n] = (p) => calls.push(n + (p && p.damage ? `(${Math.round(p.damage)})` : p && p.angle !== undefined ? `(${Math.round(p.angle)}°)` : ''));
    const r = vm.run(ev.on, { api, vars: {}, rng: () => 0.5, now: 0, damageBase: 20, sense: { aimAngle: 0, hp: 60, maxHp: 100, x: 0, y: 0, speed: 0, grounded: true, nearestDist: 70, nearestDir: 0, combo: 0, lastDamage: 18, time: 0 } });
    const out = document.getElementById('beTestOut');
    if (out) out.innerHTML = `<b class="text-[#7df09a]">${esc(EVENT_LABEL[ev.on] || ev.on)}</b> → ${calls.length}개 호출<br>${calls.slice(0, 14).map(esc).join(' · ') || '(효과 없음)'}${r.halted ? '<br><span class="text-[#ff5a5a]">⚠ 자원 한계로 중단</span>' : ''}`;
  }
  _status(t) { const el = document.getElementById('beTestOut'); if (el) el.textContent = t; }
}
