/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visual block editor for weapon gimmicks (Entry/Scratch-style, structured/nested
 * list form). It edits a block AST in place (the same format BlockVM runs) — a
 * palette adds blocks into the selected stack, each block exposes inline param
 * widgets, control blocks nest child stacks. Live block-count gauge + a Test that
 * runs the sandbox VM against a mock so authors see the calls before saving.
 *
 * Output is the pure-data AST; the host BlockVM always re-sanitizes + clamps it,
 * so the editor is a convenience, not a trust boundary.
 */

import { BlockVM, VM_LIMITS, countBlocks, EVENTS } from './BlockVM.js';

// Event (hat) blocks — the entry points.
const EVENT_LABEL = {
  basicAttack: '평타 시', skillF: 'F스킬 시', skillR: 'R 시', lmb: 'LMB 시',
  charging: '충전 중(매틱)', chargeRelease: '충전 해제 시', onHit: '명중 시', onHurt: '피격 시',
  onKill: '처치 시', onJump: '점프 시', onLand: '착지 시', onRespawn: '부활 시', onTick: '매 틱',
  projectileHit: '투사체 명중 시', placementTrigger: '설치물 발동 시',
};

// Param specs: kind drives the widget + the AST value it writes.
const P = (key, kind, def, opts) => ({ key, kind, def, opts });
const BLOCK_DEFS = {
  // actions
  spawnProjectile: { cat: 'action', label: '투사체 발사', params: [P('angle', 'angle', 0), P('speed', 'num', 520), P('range', 'num', 280), P('damagePct', 'pct', 90), P('tag', 'text', ''), P('pierce', 'bool', false)] },
  spawnMelee: { cat: 'action', label: '근접 판정', params: [P('frontOffset', 'num', 60), P('width', 'num', 50), P('height', 'num', 44), P('damagePct', 'pct', 100)] },
  spawnArea: { cat: 'action', label: '범위 판정', params: [P('radius', 'num', 60), P('damagePct', 'pct', 70)] },
  applyStatus: { cat: 'action', label: '상태이상 부여', params: [P('status', 'select', 'burn', ['bleed', 'burn', 'slow', 'stun']), P('durationMs', 'num', 1000)] },
  knockback: { cat: 'action', label: '넉백', params: [P('force', 'num', 80)] },
  heal: { cat: 'action', label: '회복', params: [P('ofLastDamagePct', 'pct', 20), P('amountPct', 'pct', 0)] },
  dash: { cat: 'action', label: '대시', params: [P('angle', 'angle', 0), P('distance', 'num', 120)] },
  jump: { cat: 'action', label: '점프', params: [P('power', 'num', 1)] },
  particle: { cat: 'action', label: '파티클', params: [P('id', 'select', 'explosion', ['explosion', 'danger_pop'])] },
  sfx: { cat: 'action', label: '사운드', params: [P('id', 'select', 'shoot', ['shoot', 'hit', 'slash', 'slam', 'explosion'])] },
  shake: { cat: 'action', label: '화면 흔들림', params: [P('level', 'select', 'weak', ['weak', 'strong'])] },
  setVar: { cat: 'action', label: '변수 설정', params: [P('var', 'text', 'charge'), P('value', 'num', 0)] },
  // control
  if: { cat: 'control', label: '만약', params: [], containers: ['then', 'else'], cond: true },
  repeat: { cat: 'control', label: '반복', params: [P('count', 'num', 3)], containers: ['body'] },
  repeatVar: { cat: 'control', label: 'i를 a..b', params: [P('var', 'text', 'i'), P('from', 'num', -1), P('to', 'num', 1)], containers: ['body'] },
  wait: { cat: 'control', label: '대기(ms)', params: [P('ms', 'num', 200)] },
  stop: { cat: 'control', label: '정지', params: [] },
};
const CATS = [['action', '동작'], ['control', '제어']];
const CMP = [['lt', '<'], ['le', '≤'], ['eq', '='], ['ge', '≥'], ['gt', '>']];
const SENSE = [['nearestDist', '적 거리'], ['myHp', '내 HP'], ['charge', '충전량'], ['mySpeed', '속도'], ['combo', '콤보']];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class BlockEditor {
  constructor() {
    this.root = document.getElementById('blockEditor');
    if (!this.root) return;
    this.state = { events: [] };
    this.evIdx = 0;
    this.insertTarget = null;   // array to append palette blocks into
    this.tier = 'workshop';
    this.onSave = null;
    document.getElementById('beClose')?.addEventListener('click', () => this.close());
    document.getElementById('beSave')?.addEventListener('click', () => { this.onSave?.(this.buildAST()); this._status('저장됨. 무기 저장 시 함께 게시/장착됩니다.'); });
    document.getElementById('beTest')?.addEventListener('click', () => this._test());
  }

  open(blocks, tier = 'workshop', onSave = null) {
    if (!this.root) return;
    this.tier = VM_LIMITS[tier] ? tier : 'workshop';
    this.onSave = onSave;
    // Deep-ish clone the incoming AST (or seed a basic-attack event).
    let s = null;
    try { s = blocks ? JSON.parse(JSON.stringify(blocks)) : null; } catch { s = null; }
    this.state = (s && Array.isArray(s.events) && s.events.length) ? s : { events: [{ on: 'basicAttack', do: [] }] };
    this.evIdx = 0;
    document.getElementById('beBlockMax').textContent = VM_LIMITS[this.tier].maxBlocks;
    this._renderAll();
    this.root.classList.remove('hidden');
  }
  close() { this.root?.classList.add('hidden'); }
  buildAST() { return JSON.parse(JSON.stringify(this.state)); }

  _renderAll() { this._renderTabs(); this._renderPalette(); this._renderWorkspace(); this._renderGauge(); }

  _renderTabs() {
    const el = document.getElementById('beEventTabs'); if (!el) return;
    const used = new Set(this.state.events.map(e => e.on));
    el.innerHTML = this.state.events.map((e, i) =>
      `<button data-ev="${i}" class="med-btn text-[10px] px-2 py-1 ${i === this.evIdx ? 'on' : ''}">${EVENT_LABEL[e.on] || e.on}</button>`).join('')
      + `<select id="beAddEvent" class="bg-[#0d0a06] border border-gray-600 text-[#45f3ff] text-[10px] px-1 py-1"><option value="">＋ 이벤트</option>${[...EVENTS].filter(o => !used.has(o)).map(o => `<option value="${o}">${EVENT_LABEL[o] || o}</option>`).join('')}</select>`;
    el.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => { this.evIdx = Number(b.dataset.ev); this.insertTarget = null; this._renderAll(); }));
    document.getElementById('beAddEvent')?.addEventListener('change', (e) => { if (e.target.value) { this.state.events.push({ on: e.target.value, do: [] }); this.evIdx = this.state.events.length - 1; this._renderAll(); } });
  }

  _renderPalette() {
    const el = document.getElementById('bePalette'); if (!el) return;
    let html = '';
    for (const [cat, label] of CATS) {
      html += `<div class="text-[10px] text-gray-400 uppercase mt-1 mb-1">${label}</div>`;
      for (const op in BLOCK_DEFS) if (BLOCK_DEFS[op].cat === cat) {
        const c = cat === 'control' ? '#c9a227' : '#45f3ff';
        html += `<button data-op="${op}" class="block w-full text-left mb-1 px-2 py-1 text-[11px] border cursor-pointer active:scale-95" style="border-color:${c};color:${c}">＋ ${BLOCK_DEFS[op].label}</button>`;
      }
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => this._addBlock(b.dataset.op)));
  }

  _curEvent() { return this.state.events[this.evIdx]; }

  _addBlock(op) {
    const def = BLOCK_DEFS[op]; if (!def) return;
    if (countBlocks(this.state) >= VM_LIMITS[this.tier].maxBlocks) { this._status('블록 한계에 도달했습니다.'); return; }
    const s = { op };
    for (const p of def.params) s[p.key] = (p.kind === 'angle') ? { op: 'add', a: { op: 'aimAngle' }, b: 0 } : p.def;
    if (def.cond) s.cond = { op: 'lt', a: { op: 'nearestDist' }, b: 90 };
    for (const c of def.containers || []) s[c] = [];
    const target = this.insertTarget || this._curEvent().do;
    target.push(s);
    this._renderWorkspace(); this._renderGauge();
  }

  _renderWorkspace() {
    const el = document.getElementById('beWorkspace'); if (!el) return;
    const ev = this._curEvent();
    if (!ev) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="text-[11px] text-[#45f3ff] mb-2">［${EVENT_LABEL[ev.on] || ev.on}］ 실행:</div>`;
    el.appendChild(this._renderStack(ev.do));
    this._bindStack(el);
  }

  // Render a statement list into a container div (with an insertion target button).
  _renderStack(arr) {
    const wrap = document.createElement('div');
    wrap.className = 'be-stack pl-2 border-l-2 border-gray-700 space-y-1';
    arr.forEach((s, i) => wrap.appendChild(this._renderStmt(s, arr, i)));
    const add = document.createElement('button');
    add.className = 'text-[10px] text-gray-500 hover:text-[#45f3ff] px-1';
    add.textContent = (this.insertTarget === arr) ? '▸ 여기에 추가 중 (팔레트 클릭)' : '＋ 여기 선택';
    add.addEventListener('click', () => { this.insertTarget = arr; this._renderWorkspace(); });
    wrap.appendChild(add);
    return wrap;
  }

  _renderStmt(s, arr, i) {
    const def = BLOCK_DEFS[s.op] || { label: s.op, params: [] };
    const row = document.createElement('div');
    const col = def.cat === 'control' ? '#c9a227' : '#45f3ff';
    row.className = 'p-1.5 border';
    row.style.borderColor = col;
    const head = document.createElement('div');
    head.className = 'flex items-center gap-1 flex-wrap text-[11px]';
    head.innerHTML = `<span style="color:${col}">${def.label}</span>`;
    // params inline
    for (const p of def.params) head.appendChild(this._paramWidget(s, p));
    if (def.cond) head.appendChild(this._condWidget(s));
    // controls: up/down/delete
    const ctl = document.createElement('span'); ctl.className = 'ml-auto flex gap-1';
    const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.className = 'text-gray-500 hover:text-white px-1'; b.addEventListener('click', fn); return b; };
    ctl.appendChild(mk('↑', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; this._renderWorkspace(); } }));
    ctl.appendChild(mk('↓', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; this._renderWorkspace(); } }));
    ctl.appendChild(mk('✕', () => { arr.splice(i, 1); if (this.insertTarget && !this._contains(this._curEvent().do, this.insertTarget)) this.insertTarget = null; this._renderWorkspace(); this._renderGauge(); }));
    head.appendChild(ctl);
    row.appendChild(head);
    // nested containers
    for (const c of def.containers || []) {
      const lbl = document.createElement('div'); lbl.className = 'text-[9px] text-gray-500 mt-1'; lbl.textContent = c === 'then' ? '이면:' : c === 'else' ? '아니면:' : '반복:';
      row.appendChild(lbl);
      row.appendChild(this._renderStack(s[c] = s[c] || []));
    }
    return row;
  }

  _contains(arr, target) {
    if (arr === target) return true;
    for (const s of arr) for (const c of (BLOCK_DEFS[s.op]?.containers || [])) if (this._contains(s[c] || [], target)) return true;
    return false;
  }

  // A numeric/param widget that writes back into the stmt AST.
  _paramWidget(s, p) {
    const span = document.createElement('span'); span.className = 'inline-flex items-center gap-0.5';
    if (p.kind === 'bool') {
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!s[p.key];
      cb.addEventListener('change', () => { s[p.key] = cb.checked; });
      span.append(this._lbl(p.key), cb); return span;
    }
    if (p.kind === 'select') {
      const sel = document.createElement('select'); sel.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px]';
      sel.innerHTML = p.opts.map(o => `<option value="${o}" ${s[p.key] === o ? 'selected' : ''}>${o}</option>`).join('');
      sel.addEventListener('change', () => { s[p.key] = sel.value; });
      span.append(this._lbl(p.key), sel); return span;
    }
    if (p.kind === 'text') {
      const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 16; inp.value = s[p.key] ?? '';
      inp.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px] w-14 px-1';
      inp.addEventListener('input', () => { s[p.key] = inp.value.slice(0, 16); });
      span.append(this._lbl(p.key), inp); return span;
    }
    if (p.kind === 'angle') {
      // AST shape: { add, aimAngle, b } where b = number OR { mul, {var:i}, num }
      const cur = s[p.key] || { op: 'add', a: { op: 'aimAngle' }, b: 0 };
      const b = cur.b;
      const perI = !!(b && b.op === 'mul');
      const off = perI ? (b.b || 0) : (typeof b === 'number' ? b : 0);
      const num = document.createElement('input'); num.type = 'number'; num.value = off; num.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px] w-12 px-1';
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = perI;
      const write = () => { const v = Number(num.value) || 0; s[p.key] = { op: 'add', a: { op: 'aimAngle' }, b: chk.checked ? { op: 'mul', a: { var: 'i' }, b: v } : v }; };
      num.addEventListener('input', write); chk.addEventListener('change', write);
      span.append(this._lbl('조준각+'), num, this._lbl('°×i'), chk); return span;
    }
    // num / pct
    const inp = document.createElement('input'); inp.type = 'number';
    inp.value = typeof s[p.key] === 'number' ? s[p.key] : (p.def || 0);
    inp.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px] w-14 px-1';
    inp.addEventListener('input', () => { s[p.key] = Number(inp.value) || 0; });
    span.append(this._lbl(p.key + (p.kind === 'pct' ? '%' : '')), inp); return span;
  }

  _condWidget(s) {
    const span = document.createElement('span'); span.className = 'inline-flex items-center gap-0.5';
    const c = s.cond = s.cond || { op: 'lt', a: { op: 'nearestDist' }, b: 90 };
    const sense = document.createElement('select'); sense.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px]';
    sense.innerHTML = SENSE.map(([o, l]) => `<option value="${o}" ${c.a?.op === o ? 'selected' : ''}>${l}</option>`).join('');
    const cmp = document.createElement('select'); cmp.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px]';
    cmp.innerHTML = CMP.map(([o, l]) => `<option value="${o}" ${c.op === o ? 'selected' : ''}>${l}</option>`).join('');
    const num = document.createElement('input'); num.type = 'number'; num.value = typeof c.b === 'number' ? c.b : 0; num.className = 'bg-[#0d0a06] border border-gray-600 text-white text-[10px] w-12 px-1';
    const write = () => { s.cond = { op: cmp.value, a: { op: sense.value }, b: Number(num.value) || 0 }; };
    sense.addEventListener('change', write); cmp.addEventListener('change', write); num.addEventListener('input', write);
    span.append(sense, cmp, num); return span;
  }

  _lbl(t) { const s = document.createElement('span'); s.className = 'text-gray-500'; s.textContent = t; return s; }
  _bindStack() { /* events bound inline during render */ }

  _renderGauge() {
    const n = countBlocks(this.state), max = VM_LIMITS[this.tier].maxBlocks;
    document.getElementById('beBlockGauge') && (document.getElementById('beBlockGauge').textContent = n);
    const bar = document.getElementById('beBlockBar');
    if (bar) { bar.style.width = Math.min(100, n / max * 100) + '%'; bar.style.background = n > max ? '#ff5a5a' : n > max * 0.85 ? '#ffd24a' : '#7df09a'; }
    const cnt = document.getElementById('meBlockCount'); if (cnt) cnt.textContent = n ? `(${n} 블록)` : '';
  }

  // Test the program against a recording mock (proves it runs safely + what fires).
  _test() {
    const vm = new BlockVM(this.buildAST(), this.tier);
    const calls = [];
    const api = {}; for (const n of ['spawnMelee', 'spawnProjectile', 'spawnArea', 'applyStatus', 'knockback', 'heal', 'dash', 'teleport', 'jump', 'pull', 'spawnPlacement', 'particle', 'sfx', 'shake', 'cooldownGate']) api[n] = (p) => calls.push(n + (p && p.damage ? `(${Math.round(p.damage)})` : p && p.angle !== undefined ? `(${Math.round(p.angle)}°)` : ''));
    const ctx = { api, vars: {}, rng: () => 0.5, now: 0, damageBase: 20, sense: { aimAngle: 0, hp: 60, maxHp: 100, x: 0, y: 0, speed: 0, grounded: true, nearestDist: 70, nearestDir: 0, combo: 0, lastDamage: 18, time: 0 } };
    const ev = this._curEvent();
    const r = vm.run(ev.on, ctx);
    const out = document.getElementById('beTestOut');
    if (out) out.innerHTML = `<b class="text-[#7df09a]">${esc(EVENT_LABEL[ev.on] || ev.on)}</b> 실행 → ${calls.length}개 호출<br>${calls.slice(0, 12).map(esc).join(' · ') || '(효과 없음)'}${r.halted ? '<br><span class="text-[#ff5a5a]">⚠ 자원 한계로 중단됨</span>' : ''}`;
  }

  _status(t) { const el = document.getElementById('beTestOut'); if (el) el.textContent = t; }
}
