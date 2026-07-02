/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Weapon-gimmick block editor — Entry/Scratch-style drag-snap, modeled on
 * 13_block_editor_demo.html: a flow-layout stack of DOM blocks with an insertion
 * indicator, C-block inner dropzones, palette drag-to-insert / click-to-append,
 * reporter (pill) + boolean (hex) blocks that nest into value slots, and
 * live AST serialization.
 *
 * SCHEMA NOTE: BlockVM.js is frozen (sandbox interpreter, resource limits,
 * envelope). We keep ITS AST — statement = { op, ...flatArgs, then/else/body },
 * value/boolean expr = { op, a, b, ... } — so existing saved weapons round-trip
 * and the host VM is unchanged. (The demo groups args under `args:{}`; here they
 * sit flat on the stmt, which is what BlockVM reads.) A dropped reporter/boolean
 * becomes the slot's value-expr; a plain slot is a number/string literal.
 *
 * Drag uses HTML5 DnD (like the demo) for desktop; touch keeps the demo's
 * click-to-append + a tap ✕ delete as the accessible fallback (spec §6).
 */

import { BlockVM, VM_LIMITS, countBlocks, EVENTS } from './BlockVM.js';

const C = { ev: '#c9a227', act: '#3a6ea5', ctl: '#c96f27', val: '#3a8f7a', op: '#5a8f3c', vr: '#b32d2d' };
const CATN = { ev: '이벤트', act: '동작', ctl: '제어', val: '값', op: '연산', vr: '변수' };

// s = string token; or { a:key, t:type, d:default, o:[opts] }
const s = (a, t, d, o) => ({ a, t, d, o });
const DEFS = {
  // ── events (hat) — op maps to BlockVM EVENTS ──
  basicAttack: { cat: 'ev', hat: 1, op: 'basicAttack', parts: ['평타 시'] },
  skillF: { cat: 'ev', hat: 1, op: 'skillF', parts: ['F스킬 시'] },
  onHit: { cat: 'ev', hat: 1, op: 'onHit', parts: ['명중 시'] },
  onKill: { cat: 'ev', hat: 1, op: 'onKill', parts: ['처치 시'] },
  onTick: { cat: 'ev', hat: 1, op: 'onTick', parts: ['매 틱'] },
  projectileHit: { cat: 'ev', hat: 1, op: 'projectileHit', parts: ['투사체', s('tag', 'text', ''), '명중 시'] },
  // ── actions ──
  spawnProjectile: { cat: 'act', op: 'spawnProjectile', parts: ['투사체 발사 각도', s('angle', 'num', 0), '속도', s('speed', 'num', 520), '사거리', s('range', 'num', 280), '데미지', s('damagePct', 'num', 90), '% 태그', s('tag', 'text', ''), '관통', s('pierce', 'check', false)] },
  spawnMelee: { cat: 'act', op: 'spawnMelee', parts: ['근접 판정 앞', s('frontOffset', 'num', 60), '폭', s('width', 'num', 50), '높이', s('height', 'num', 44), '데미지', s('damagePct', 'num', 100), '%'] },
  spawnArea: { cat: 'act', op: 'spawnArea', parts: ['범위 판정 반경', s('radius', 'num', 60), '데미지', s('damagePct', 'num', 70), '%'] },
  applyStatus: { cat: 'act', op: 'applyStatus', parts: ['상태이상', s('status', 'sel', 'burn', ['bleed', 'burn', 'slow', 'stun']), '지속', s('durationMs', 'num', 1000), 'ms'] },
  heal: { cat: 'act', op: 'heal', parts: ['회복 마지막 피해의', s('ofLastDamagePct', 'num', 20), '%'] },
  knockback: { cat: 'act', op: 'knockback', parts: ['넉백 힘', s('force', 'num', 80)] },
  dash: { cat: 'act', op: 'dash', parts: ['대시 각도', s('angle', 'num', 0), '거리', s('distance', 'num', 120)] },
  teleport: { cat: 'act', op: 'teleport', parts: ['텔레포트 거리', s('distance', 'num', 120)] },
  jump: { cat: 'act', op: 'jump', parts: ['점프 세기', s('power', 'num', 1)] },
  pull: { cat: 'act', op: 'pull', parts: ['끌어오기 거리', s('distance', 'num', 120)] },
  particle: { cat: 'act', op: 'particle', parts: ['파티클', s('id', 'sel', 'explosion', ['explosion', 'danger_pop'])] },
  sfx: { cat: 'act', op: 'sfx', parts: ['사운드', s('id', 'sel', 'shoot', ['shoot', 'hit', 'slash', 'slam', 'explosion'])] },
  shake: { cat: 'act', op: 'shake', parts: ['화면 흔들림', s('level', 'sel', 'weak', ['weak', 'strong'])] },
  // ── control (C-blocks) ──
  if: { cat: 'ctl', c: 1, op: 'if', parts: ['만약', s('cond', 'bool')], containers: ['then', 'else'] },
  repeat: { cat: 'ctl', c: 1, op: 'repeat', parts: [s('count', 'num', 3), '번 반복'], containers: ['body'] },
  repeatVar: { cat: 'ctl', c: 1, op: 'repeatVar', parts: [s('var', 'text', 'i'), '를', s('from', 'num', -1), '부터', s('to', 'num', 1), '까지'], containers: ['body'] },
  wait: { cat: 'ctl', op: 'wait', parts: ['대기', s('ms', 'num', 200), 'ms'] },
  stop: { cat: 'ctl', op: 'stop', parts: ['정지'] },
  // ── values (reporters, pill) ──
  aimAngle: { cat: 'val', rep: 1, op: 'aimAngle', parts: ['조준각'] },
  nearestDist: { cat: 'val', rep: 1, op: 'nearestDist', parts: ['가까운 적 거리'] },
  myHp: { cat: 'val', rep: 1, op: 'myHp', parts: ['내 HP'] },
  charge: { cat: 'val', rep: 1, op: 'charge', parts: ['충전량'] },
  combo: { cat: 'val', rep: 1, op: 'combo', parts: ['콤보'] },
  lastDamage: { cat: 'val', rep: 1, op: 'lastDamage', parts: ['마지막 피해'] },
  rand: { cat: 'val', rep: 1, op: 'rand', parts: ['난수', s('a', 'num', 1), '~', s('b', 'num', 10)] },
  // ── operators (reporters + booleans) ──
  add: { cat: 'op', rep: 1, op: 'add', parts: [s('a', 'num', 0), '+', s('b', 'num', 12)] },
  sub: { cat: 'op', rep: 1, op: 'sub', parts: [s('a', 'num', 0), '−', s('b', 'num', 0)] },
  mul: { cat: 'op', rep: 1, op: 'mul', parts: [s('a', 'num', 1), '×', s('b', 'num', 2)] },
  div: { cat: 'op', rep: 1, op: 'div', parts: [s('a', 'num', 1), '÷', s('b', 'num', 2)] },
  lt: { cat: 'op', bool: 1, op: 'lt', parts: [s('a', 'num', 0), '<', s('b', 'num', 90)] },
  gt: { cat: 'op', bool: 1, op: 'gt', parts: [s('a', 'num', 0), '>', s('b', 'num', 0)] },
  ge: { cat: 'op', bool: 1, op: 'ge', parts: [s('a', 'num', 0), '≥', s('b', 'num', 0)] },
  le: { cat: 'op', bool: 1, op: 'le', parts: [s('a', 'num', 0), '≤', s('b', 'num', 0)] },
  eq: { cat: 'op', bool: 1, op: 'eq', parts: [s('a', 'num', 0), '=', s('b', 'num', 0)] },
  and: { cat: 'op', bool: 1, op: 'and', parts: [s('a', 'bool'), '그리고', s('b', 'bool')] },
  or: { cat: 'op', bool: 1, op: 'or', parts: [s('a', 'bool'), '또는', s('b', 'bool')] },
  // ── variables ──
  setVar: { cat: 'vr', op: 'setVar', parts: ['변수', s('var', 'text', 'charge'), '=', s('value', 'num', 0)] },
};
// op → def id (for import).
const OP2ID = {}; for (const id in DEFS) OP2ID[DEFS[id].op] = id;

function ensureStyles() {
  if (document.getElementById('beStyles')) return;
  const st = document.createElement('style'); st.id = 'beStyles';
  st.textContent = `
  #beWorkspace .stack{display:flex;flex-direction:column;gap:2px;align-items:flex-start}
  .be-blk{position:relative;border-radius:5px;padding:5px 10px 6px;color:#fff;font-size:11px;width:fit-content;max-width:100%;box-shadow:0 1px 0 rgba(0,0,0,.3);cursor:grab;line-height:1.9;font-family:system-ui,sans-serif}
  .be-blk::after{content:'';position:absolute;left:12px;bottom:-4px;width:16px;height:5px;background:inherit;border-radius:0 0 4px 4px}
  .be-hat{border-radius:16px 16px 5px 5px;font-weight:500}
  .be-rep{border-radius:999px;padding:2px 9px;display:inline-flex;vertical-align:middle}
  .be-rep::after{display:none}
  .be-bool{clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);padding:2px 13px;display:inline-flex;vertical-align:middle}
  .be-bool::after{display:none}
  .be-sl{width:42px;background:#fff;border:none;border-radius:999px;padding:2px 6px;font-size:11px;color:#1a1a1a;text-align:center;margin:0 2px}
  select.be-sl{width:auto}
  .be-slot{display:inline-flex;align-items:center;min-height:18px;margin:0 2px}
  .be-bslot{display:inline-flex;align-items:center;min-width:34px;min-height:16px;margin:0 3px;background:rgba(0,0,0,.28);border-radius:0;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);padding:0 8px}
  .be-cwrap{width:fit-content}
  .be-cinner{margin-left:14px;border-left:14px solid;padding:3px 0 3px 5px;display:flex;flex-direction:column;gap:2px;min-height:16px;min-width:130px;border-radius:0 0 0 4px}
  .be-cfoot{height:11px;width:90px;border-radius:0 0 5px 5px;position:relative}
  .be-cfoot::after{content:'';position:absolute;left:12px;bottom:-4px;width:16px;height:5px;background:inherit;border-radius:0 0 4px 4px}
  .be-del{position:absolute;top:-6px;right:-6px;width:15px;height:15px;line-height:13px;text-align:center;background:#241710;color:#e8d5a3;border:1px solid #6b4a2b;border-radius:50%;font-size:10px;cursor:pointer;display:none;z-index:3}
  .be-blk:hover>.be-del{display:block}
  .be-ind{height:3px;background:#ffd75e;border-radius:2px;width:150px;margin:1px 0;flex:none}
  .be-orphan{opacity:.5}
  .be-orphan-badge{font-size:8px;color:#ff9e9e;margin-left:4px}
  .be-shake{animation:beShake .28s}
  @keyframes beShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  #bePalette .be-blk{cursor:pointer;margin-bottom:6px}`;
  document.head.appendChild(st);
}

const numOr = (v) => { const n = Number(v); return isNaN(n) ? v : n; };

export class BlockEditor {
  constructor() {
    this.root = document.getElementById('blockEditor');
    if (!this.root) return;
    ensureStyles();
    this.ws = document.getElementById('beWorkspace');
    this.cat = 'ev'; this.tier = 'workshop'; this.onSave = null;
    this.ind = document.createElement('div'); this.ind.className = 'be-ind';
    document.getElementById('beClose')?.addEventListener('click', () => this.close());
    document.getElementById('beSave')?.addEventListener('click', () => { this.onSave?.(this.buildAST()); this._status('저장됨. 무기 저장 시 함께 적용됩니다.'); });
    document.getElementById('beTest')?.addEventListener('click', () => this._test());
    // Category tabs live in the top tab row.
    const tabs = document.getElementById('beEventTabs');
    if (tabs) { tabs.innerHTML = ''; for (const k in CATN) { const t = document.createElement('button'); t.className = 'med-btn text-[10px] px-2 py-1'; t.dataset.cat = k; t.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${C[k]};margin-right:3px"></span>${CATN[k]}`; t.addEventListener('click', () => { this.cat = k; this._renderPalette(); this._syncTabs(); }); tabs.appendChild(t); } }
  }

  open(ast, tier = 'workshop', onSave = null) {
    if (!this.root) return;
    this.tier = VM_LIMITS[tier] ? tier : 'workshop';
    this.onSave = onSave;
    document.getElementById('beBlockMax').textContent = VM_LIMITS[this.tier].maxBlocks;
    if (!this.ws.querySelector('.stack')) { this.stack = document.createElement('div'); this.stack.className = 'stack'; this.ws.innerHTML = ''; this.ws.appendChild(this.stack); this._dz(this.stack); }
    this.stack.innerHTML = '';
    this._import(ast);
    if (!this.stack.children.length) this.stack.appendChild(this._mk('basicAttack'));
    this._renderPalette(); this._syncTabs(); this._refresh();
    this.root.classList.remove('hidden');
  }
  close() { this.root?.classList.add('hidden'); }
  _syncTabs() { document.querySelectorAll('#beEventTabs [data-cat]').forEach(t => t.classList.toggle('on', t.dataset.cat === this.cat)); }

  // ── build a block DOM node ──
  _mk(id) {
    const d = DEFS[id]; if (!d) return document.createElement('div');
    const b = document.createElement('div');
    b.className = 'be-blk' + (d.hat ? ' be-hat' : '') + (d.rep ? ' be-rep' : '') + (d.bool ? ' be-bool' : '');
    b.style.background = C[d.cat]; b.dataset.id = id; b.dataset.op = d.op;
    for (const part of d.parts) {
      if (typeof part === 'string') { b.appendChild(document.createTextNode(' ' + part + ' ')); continue; }
      b.appendChild(this._slot(part));
    }
    const del = document.createElement('span'); del.className = 'be-del'; del.textContent = '×'; del.title = '삭제';
    del.addEventListener('click', (e) => { e.stopPropagation(); (b.dataset.cwrap ? b : (b.closest('.be-cwrap') && b.closest('.be-cwrap').querySelector(':scope>.be-blk') === b ? b.closest('.be-cwrap') : b)).remove(); this._refresh(); });
    b.appendChild(del);
    if (d.c) {
      const wrap = document.createElement('div'); wrap.className = 'be-cwrap'; wrap.dataset.cwrap = id; wrap.dataset.op = d.op; wrap.dataset.id = id;
      wrap.appendChild(b);
      for (const cont of d.containers) {
        const inner = document.createElement('div'); inner.className = 'be-cinner'; inner.style.borderColor = C[d.cat]; inner.dataset.container = cont;
        if (cont === 'else') { const lbl = document.createElement('div'); lbl.style.cssText = 'font-size:10px;color:#fff;opacity:.8'; lbl.textContent = '아니면'; wrap.appendChild(lbl); }
        this._dz(inner); wrap.appendChild(inner);
      }
      const foot = document.createElement('div'); foot.className = 'be-cfoot'; foot.style.background = C[d.cat]; wrap.appendChild(foot);
      this._hookDrag(b, wrap);
      // del on the head removes the whole wrap
      del.onclick = (e) => { e.stopPropagation(); wrap.remove(); this._refresh(); };
      return wrap;
    }
    this._hookDrag(b, b);
    return b;
  }

  // ── a value/boolean slot (holds an input/select, or a nested block) ──
  _slot(part) {
    if (part.t === 'bool') {
      const slot = document.createElement('span'); slot.className = 'be-bslot'; slot.dataset.a = part.a; slot.dataset.slotType = 'bool';
      this._slotDrop(slot); return slot;
    }
    const slot = document.createElement('span'); slot.className = 'be-slot'; slot.dataset.a = part.a; slot.dataset.slotType = part.t;
    let inp;
    if (part.t === 'sel') { inp = document.createElement('select'); inp.className = 'be-sl'; inp.innerHTML = part.o.map(o => `<option>${o}</option>`).join(''); inp.value = part.d; }
    else if (part.t === 'check') { inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!part.d; }
    else if (part.t === 'text') { inp = document.createElement('input'); inp.className = 'be-sl'; inp.value = part.d ?? ''; }
    else { inp = document.createElement('input'); inp.className = 'be-sl'; inp.value = part.d ?? 0; }
    inp.dataset.a = part.a;
    inp.addEventListener('input', () => this._refresh());
    inp.addEventListener('change', () => this._refresh());
    inp.addEventListener('mousedown', (e) => e.stopPropagation());
    inp.draggable = false;
    slot.appendChild(inp);
    if (part.t === 'num') this._slotDrop(slot);   // only number slots accept reporters
    return slot;
  }

  // ── drag hooks (HTML5 DnD, demo-style) ──
  _hookDrag(headEl, rootEl) {
    rootEl.draggable = true;
    rootEl.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      // sub-stack drag: carry this node + following siblings up to the next hat.
      window._beMv = this._collectRun(rootEl);
      window._bePal = null; window._beRep = null;
      try { e.dataTransfer.setData('text/plain', ''); } catch {}
    });
    headEl.querySelectorAll('.be-sl').forEach(sl => sl.addEventListener('mousedown', e => e.stopPropagation()));
  }

  // Contiguous run: the block + siblings after it until the next hat (Scratch feel).
  _collectRun(node) {
    if (node.closest('.be-cinner') || DEFS[node.dataset.id]?.hat) {
      // inside a C mouth OR a hat: dragging a hat carries its trailing stack too
      if (DEFS[node.dataset.id]?.hat) return this._runFrom(node);
      return [node];
    }
    return this._runFrom(node);
  }
  _runFrom(node) {
    const run = [node]; let n = node.nextElementSibling;
    while (n && n !== this.ind) { if (this._isHat(n)) break; run.push(n); n = n.nextElementSibling; }
    return run;
  }
  _isHat(node) { const id = node.dataset && node.dataset.id; return id && DEFS[id] && DEFS[id].hat; }

  _dz(zone) {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (window._beRep) return;    // reporter drags target slots, not stacks
      const kids = [...zone.children].filter(k => k !== this.ind && !(window._beMv || []).includes(k));
      let ref = null; const y = e.clientY;
      for (const k of kids) { const r = k.getBoundingClientRect(); if (y < r.top + r.height / 2) { ref = k; break; } }
      zone.insertBefore(this.ind, ref);
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (window._beRep) { this.ind.remove(); return; }
      let nodes = window._beMv;
      if (window._bePal) nodes = [this._mk(window._bePal)];
      window._beMv = null; window._bePal = null;
      if (nodes) for (const nd of nodes) zone.insertBefore(nd, this.ind);
      this.ind.remove(); this._refresh();
    });
    zone.addEventListener('dragleave', (e) => { if (e.target === zone) this.ind.remove(); });
  }

  // Reporter/boolean dropped into a slot.
  _slotDrop(slot) {
    slot.addEventListener('dragover', (e) => { if (window._beRep) { e.preventDefault(); e.stopPropagation(); slot.style.outline = '2px solid #ffd75e'; } });
    slot.addEventListener('dragleave', () => { slot.style.outline = ''; });
    slot.addEventListener('drop', (e) => {
      const rep = window._beRep; if (!rep) return;
      e.preventDefault(); e.stopPropagation(); slot.style.outline = '';
      const def = DEFS[rep];
      const wantBool = slot.dataset.slotType === 'bool';
      if (wantBool !== !!def.bool) { slot.classList.add('be-shake'); setTimeout(() => slot.classList.remove('be-shake'), 300); window._beRep = null; return; } // type mismatch
      slot.innerHTML = ''; const node = this._mk(rep); slot.appendChild(node);
      window._beRep = null; window._beMv = null; this._refresh();
    });
  }

  // ── palette ──
  _renderPalette() {
    const pal = document.getElementById('bePalette'); if (!pal) return;
    pal.innerHTML = '';
    for (const id in DEFS) {
      if (DEFS[id].cat !== this.cat) continue;
      const d = DEFS[id];
      const p = document.createElement('div');
      p.className = 'be-blk' + (d.hat ? ' be-hat' : '') + (d.rep ? ' be-rep' : '') + (d.bool ? ' be-bool' : '');
      p.style.background = C[d.cat];
      for (const part of d.parts) p.appendChild(typeof part === 'string' ? document.createTextNode(' ' + part + ' ') : this._slot(part));
      p.querySelectorAll('.be-sl,input,select').forEach(x => { x.disabled = true; });
      p.draggable = true;
      p.addEventListener('dragstart', (e) => { if (d.rep || d.bool) { window._beRep = id; window._beMv = null; } else { window._bePal = id; window._beMv = null; window._beRep = null; } try { e.dataTransfer.setData('text/plain', id); } catch {} });
      p.addEventListener('click', () => { if (d.rep || d.bool) { this._status('값/조건 블록은 슬롯으로 드래그하세요.'); return; } this.stack.appendChild(this._mk(id)); this._refresh(); });
      pal.appendChild(p);
    }
  }

  // ── serialize DOM → AST (BlockVM schema) ──
  buildAST() {
    const events = []; let cur = null;
    for (const node of this.stack.children) {
      if (node === this.ind) continue;
      if (this._isHat(node)) { cur = { on: node.dataset.op, do: [] }; const tag = this._headTag(node); if (tag) cur.tag = tag; events.push(cur); continue; }
      const stmt = this._nodeStmt(node); if (!stmt) continue;
      if (!cur) { cur = { on: 'basicAttack', do: [] }; events.push(cur); }
      cur.do.push(stmt);
    }
    return { events };
  }
  _headTag(hatNode) { const t = hatNode.querySelector(':scope .be-slot[data-a="tag"] input'); return t ? t.value : ''; }

  _nodeStmt(node) {
    const isWrap = node.dataset && node.dataset.cwrap;
    const head = isWrap ? node.querySelector(':scope>.be-blk') : node;
    if (!head || !head.dataset.op) return null;
    const stmt = { op: head.dataset.op };
    this._readSlots(head, stmt);
    if (isWrap) {
      const inners = node.querySelectorAll(':scope>.be-cinner');
      const def = DEFS[node.dataset.id];
      def.containers.forEach((cont, i) => {
        const inner = inners[i]; const arr = [];
        if (inner) for (const k of inner.children) { if (k === this.ind) continue; const st = this._nodeStmt(k); if (st) arr.push(st); }
        stmt[cont] = arr;
      });
    }
    return stmt;
  }
  // Read the block head's direct slots into args (nested reporter → value-expr).
  _readSlots(head, target) {
    for (const slot of head.querySelectorAll(':scope > .be-slot, :scope > .be-bslot')) {
      const key = slot.dataset.a; if (!key) continue;
      const nested = slot.querySelector(':scope > .be-blk, :scope > .be-rep, :scope > .be-bool, :scope > .be-cwrap, :scope > [data-op]');
      if (nested) { target[key] = this._exprOf(nested); continue; }
      const inp = slot.querySelector('input,select');
      if (!inp) { if (slot.dataset.slotType === 'bool') target[key] = { op: 'lt', a: { op: 'nearestDist' }, b: 90 }; continue; }
      if (inp.type === 'checkbox') target[key] = inp.checked;
      else target[key] = numOr(inp.value);
    }
  }
  // A reporter/boolean block → value-expr AST.
  _exprOf(node) {
    const expr = { op: node.dataset.op };
    this._readSlots(node, expr);
    return expr;
  }

  // ── import AST → DOM ──
  _import(ast) {
    if (!ast || !Array.isArray(ast.events)) return;
    for (const ev of ast.events) {
      const hatId = OP2ID[ev.on]; if (!hatId || !DEFS[hatId].hat) continue;
      const hat = this._mk(hatId);
      if (ev.tag) { const t = hat.querySelector('.be-slot[data-a="tag"] input'); if (t) t.value = ev.tag; }
      this.stack.appendChild(hat);
      for (const st of (ev.do || [])) { const node = this._buildFromStmt(st); if (node) this.stack.appendChild(node); }
    }
  }
  _buildFromStmt(st) {
    const id = OP2ID[st.op]; if (!id) return null;
    const node = this._mk(id); const def = DEFS[id];
    const head = node.dataset.cwrap ? node.querySelector(':scope>.be-blk') : node;
    this._fillSlots(head, st);
    if (def.containers) {
      const inners = node.querySelectorAll(':scope>.be-cinner');
      def.containers.forEach((cont, i) => { const arr = st[cont]; if (Array.isArray(arr) && inners[i]) for (const c of arr) { const cn = this._buildFromStmt(c); if (cn) inners[i].appendChild(cn); } });
    }
    return node;
  }
  _fillSlots(head, src) {
    for (const slot of head.querySelectorAll(':scope > .be-slot, :scope > .be-bslot')) {
      const key = slot.dataset.a; if (!key || !(key in src)) continue;
      const v = src[key];
      if (v && typeof v === 'object' && v.op) { slot.innerHTML = ''; const rn = this._buildExpr(v); if (rn) slot.appendChild(rn); continue; }
      const inp = slot.querySelector('input,select'); if (!inp) continue;
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v;
    }
  }
  _buildExpr(expr) {
    const id = OP2ID[expr.op]; if (!id) return null;
    const node = this._mk(id); this._fillSlots(node, expr); return node;
  }

  // ── orphan marking + gauge ──
  _refresh() {
    // Dim leading blocks before the first hat (won't run).
    let seenHat = false;
    for (const node of this.stack.children) {
      if (node === this.ind) continue;
      if (this._isHat(node)) { seenHat = true; node.classList.remove('be-orphan'); this._badge(node, false); continue; }
      node.classList.toggle('be-orphan', !seenHat);
      this._badge(node, !seenHat);
    }
    this._gauge();
  }
  _badge(node, on) {
    const head = node.dataset.cwrap ? node.querySelector(':scope>.be-blk') : node;
    let b = head.querySelector(':scope>.be-orphan-badge');
    if (on && !b) { b = document.createElement('span'); b.className = 'be-orphan-badge'; b.textContent = '실행 안 됨'; head.appendChild(b); }
    else if (!on && b) b.remove();
  }
  _gauge() {
    const n = countBlocks(this.buildAST()), max = VM_LIMITS[this.tier].maxBlocks;
    const g = document.getElementById('beBlockGauge'); if (g) g.textContent = n;
    const bar = document.getElementById('beBlockBar'); if (bar) { bar.style.width = Math.min(100, n / max * 100) + '%'; bar.style.background = n > max ? '#ff5a5a' : n > max * 0.85 ? '#ffd24a' : '#7df09a'; }
    const cnt = document.getElementById('meBlockCount'); if (cnt) cnt.textContent = n ? `(${n} 블록)` : '';
  }

  _test() {
    const events = this.buildAST().events; const ev = events.find(e => e.do && e.do.length) || events[0];
    if (!ev) { this._status('실행할 이벤트 블록이 없습니다.'); return; }
    const vm = new BlockVM(this.buildAST(), this.tier);
    const calls = []; const api = {}; for (const nm of ['spawnMelee', 'spawnProjectile', 'spawnArea', 'applyStatus', 'knockback', 'heal', 'dash', 'teleport', 'jump', 'pull', 'spawnPlacement', 'particle', 'sfx', 'shake', 'cooldownGate']) api[nm] = (p) => calls.push(nm + (p && p.damage ? `(${Math.round(p.damage)})` : p && p.angle !== undefined ? `(${Math.round(p.angle)}°)` : ''));
    const r = vm.run(ev.on, { api, vars: {}, rng: () => 0.5, now: 0, damageBase: 20, sense: { aimAngle: 0, hp: 60, maxHp: 100, x: 0, y: 0, speed: 0, grounded: true, nearestDist: 70, nearestDir: 0, combo: 0, lastDamage: 18, time: 0 } });
    const out = document.getElementById('beTestOut');
    if (out) out.innerHTML = `<b class="text-[#7df09a]">${(ev.on)}</b> → ${calls.length}개 호출<br>${calls.slice(0, 14).join(' · ') || '(효과 없음)'}${r.halted ? '<br><span class="text-[#ff5a5a]">⚠ 자원 한계로 중단</span>' : ''}`;
  }
  _status(t) { const el = document.getElementById('beTestOut'); if (el) el.textContent = t; }
}
