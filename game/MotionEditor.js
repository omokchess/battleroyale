/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-game motion editor (Phase C of the stickman pivot) — a small Stick-Nodes
 * style tool: drag joints to pose the figure, drop keyframes along a timeline,
 * place the impact marker, preview, and save. Output is PURE COSMETIC motion
 * data (the schema in Motion.js); it can never touch hitboxes/range/damage/
 * cooldown/physics.
 *
 * Guardrails (the whole point):
 *  - The weapon's hit-active window is fixed and DRAWN on the timeline as a band;
 *    the impact marker is clamped inside it, so a user can only choose WHERE in
 *    the cosmetic swing the (already fixed) hit reads from.
 *  - Scope caps keep it light + the data bounded: ≤ 8 keyframes, fixed canvas,
 *    the 10 known joints only.
 *  - Everything is re-sanitized by Motion.sanitizeMotion on save/load/register,
 *    so even a hand-edited localStorage blob can't inject unsafe data.
 */

import { solveStickman, drawStickFromJoints, samplePose, STICK_NEUTRAL, WEAPON_STICK_COLOR } from './Stickman.js';
import { resolveMotion, weaponSetId, sanitizeMotion, registerMotionSet, MOTION_LIMITS } from './Motion.js';
import { MOTION_PRESETS } from './MotionPresets.js';
import { captureMotionFromWebcam } from './PoseCapture.js';
import { equippedStickLook, saveStickLook } from './StickLook.js';

const MAX_KF = 8;                                  // editor keyframe budget
const HIT_WINDOW = { start: 0.3, end: 0.7 };       // fixed cosmetic impact band (normalized)
const STORE_SETS = 'pixelroyale_motionsets_v1';    // { id: { attack: motion } }
const STORE_EQUIP = 'pixelroyale_equipped_motion_v1';

// Editable weapons (those whose stick attack reads clearly). Kept short on purpose.
const EDITOR_WEAPONS = ['sword', 'spear', 'hammer', 'katana', 'axe', 'rapier', 'bow', 'scythe'];

// Which pose joint + parent joint each draggable handle controls.
const HANDLES = [
  { name: 'neck',   joint: 'spine',     parent: 'pelvis' },
  { name: 'head',   joint: 'head',      parent: 'neck' },
  { name: 'elbowN', joint: 'armNearU',  parent: 'shoulder' },
  { name: 'handN',  joint: 'armNearL',  parent: 'elbowN' },
  { name: 'elbowF', joint: 'armFarU',   parent: 'shoulder' },
  { name: 'handF',  joint: 'armFarL',   parent: 'elbowF' },
  { name: 'kneeN',  joint: 'legNearU',  parent: 'pelvis' },
  { name: 'footN',  joint: 'legNearL',  parent: 'kneeN' },
  { name: 'kneeF',  joint: 'legFarU',   parent: 'pelvis' },
  { name: 'footF',  joint: 'legFarL',   parent: 'kneeF' },
  { name: 'weaponTip', joint: 'weapon', parent: 'handN' },   // rotate the held weapon
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

/** Load + re-register every stored user motion set (call once at app start). */
export function loadStoredMotionSets() {
  let sets = {};
  try { sets = JSON.parse(localStorage.getItem(STORE_SETS) || '{}') || {}; } catch { sets = {}; }
  for (const id in sets) {
    // Re-sanitize on the way in — never trust a hand-edited blob.
    const safe = {};
    for (const state in sets[id]) safe[state] = sanitizeMotion(sets[id][state]);
    registerMotionSet(id, safe);
  }
  return sets;
}

/** The currently equipped custom motion-set id (or null). */
export function equippedMotionSetId() {
  try { return localStorage.getItem(STORE_EQUIP) || null; } catch { return null; }
}

export class MotionEditor {
  constructor() {
    this.root = document.getElementById('motionEditor');
    if (!this.root) return;
    this.canvas = document.getElementById('meCanvas');
    this.timeline = document.getElementById('meTimeline');
    this.ctx = this.canvas?.getContext('2d');
    this.tctx = this.timeline?.getContext('2d');

    this.weapon = 'sword';
    this.look = equippedStickLook();   // stick appearance (live-applied + equipped)
    this.motion = null;          // working { duration, loop:false, keyframes, events }
    this.selKf = 0;
    this.playing = false;
    this.scrubT = 0;
    this.dragHandle = null;
    this.dragKfIndex = -1;
    this.dragImpact = false;
    this._raf = null;
    this._lastT = 0;

    this._wire();
  }

  _wire() {
    const $ = (id) => document.getElementById(id);
    $('meClose')?.addEventListener('click', () => this.close());
    $('meAddKf')?.addEventListener('click', () => this._addKeyframe());
    $('meDelKf')?.addEventListener('click', () => this._delKeyframe());
    $('mePlay')?.addEventListener('click', () => this._togglePlay());
    $('meReset')?.addEventListener('click', () => this._loadTemplate());
    $('meSave')?.addEventListener('click', () => this._save());
    $('meCapture')?.addEventListener('click', () => this._capture());
    const dur = $('meDuration');
    dur?.addEventListener('input', () => {
      this.motion.duration = clamp(parseFloat(dur.value) || 0.5, MOTION_LIMITS.minDuration, 1.5);
      $('meDurationVal') && ($('meDurationVal').textContent = this.motion.duration.toFixed(2) + 's');
      this._renderTimeline();
    });
    const wsel = $('meWeapon');
    if (wsel) {
      wsel.innerHTML = EDITOR_WEAPONS.map(w => `<option value="${w}">${w}</option>`).join('');
      wsel.addEventListener('change', () => { this.weapon = wsel.value; this._loadTemplate(); });
    }
    // Preset library (Phase D, no-ML path): click a preset to retarget it onto
    // the current stick instantly; the user can then tweak + save as usual.
    const presets = $('mePresets');
    if (presets) {
      presets.innerHTML = MOTION_PRESETS.map(p =>
        `<button data-preset="${p.id}" class="me-preset bg-[#14100b] hover:bg-gray-800 border border-[#7df09a] text-[#7df09a] text-[10px] px-2 py-1 cursor-pointer active:scale-95">${p.name}</button>`
      ).join('');
      presets.querySelectorAll('.me-preset').forEach(btn => {
        btn.addEventListener('click', () => this._loadPreset(btn.dataset.preset));
      });
    }
    // Appearance controls (Phase E): live-apply + persist the equipped look.
    const applyLook = (patch) => {
      this.look = saveStickLook({ ...this.look, ...patch });
      this._renderPreview();
    };
    $('meColor')?.addEventListener('input', (e) => applyLook({ color: e.target.value }));
    $('meColorClear')?.addEventListener('click', () => applyLook({ color: null }));
    $('meLineW')?.addEventListener('input', (e) => applyLook({ lineW: parseInt(e.target.value, 10) }));
    $('meHead')?.addEventListener('change', (e) => applyLook({ head: e.target.value }));
    $('meAccessory')?.addEventListener('change', (e) => applyLook({ accessory: e.target.value }));

    // Preview canvas: drag joint handles.
    this.canvas?.addEventListener('pointerdown', (e) => this._previewDown(e));
    window.addEventListener('pointermove', (e) => this._pointerMove(e));
    window.addEventListener('pointerup', () => this._pointerUp());
    // Timeline: scrub / select / drag keyframe + impact.
    this.timeline?.addEventListener('pointerdown', (e) => this._timelineDown(e));
  }

  open(weapon = 'sword') {
    if (!this.root) return;
    this.weapon = EDITOR_WEAPONS.includes(weapon) ? weapon : 'sword';
    const wsel = document.getElementById('meWeapon'); if (wsel) wsel.value = this.weapon;
    // Reflect the equipped look in the appearance controls.
    this.look = equippedStickLook();
    const $ = (id) => document.getElementById(id);
    if ($('meColor')) $('meColor').value = this.look.color || '#7df09a';
    if ($('meLineW')) $('meLineW').value = String(this.look.lineW);
    if ($('meHead')) $('meHead').value = this.look.head;
    if ($('meAccessory')) $('meAccessory').value = this.look.accessory;
    this._loadTemplate();
    this.root.classList.remove('hidden');
  }
  close() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.root?.classList.add('hidden');
  }

  _loadTemplate() {
    // Start from the weapon's current attack swing so users tweak, not start blank.
    const base = resolveMotion(weaponSetId(this.weapon), 'attack');
    this.motion = sanitizeMotion(base);
    if (this.motion.keyframes.length > MAX_KF) this.motion.keyframes = this.motion.keyframes.slice(0, MAX_KF);
    if (!this.motion.events.some(e => e.type === 'impact')) {
      this.motion.events.push({ t: (HIT_WINDOW.start + HIT_WINDOW.end) / 2, type: 'impact' });
    }
    // Clamp any impact into the window up front (guardrail).
    for (const e of this.motion.events) if (e.type === 'impact') e.t = clamp(e.t, HIT_WINDOW.start, HIT_WINDOW.end);
    this.selKf = 0;
    this.scrubT = this.motion.keyframes[0]?.t || 0;
    this.playing = false;
    const dur = document.getElementById('meDuration');
    if (dur) { dur.value = String(this.motion.duration); }
    const dv = document.getElementById('meDurationVal'); if (dv) dv.textContent = this.motion.duration.toFixed(2) + 's';
    this._setStatus('무기 기본 스윙을 불러왔습니다. 관절을 끌어 포즈를 만들고 키프레임을 추가하세요.');
    this._renderAll();
  }

  /** Retarget a library preset onto the current stick (Phase D no-ML path). The
   *  preset is sanitized + its impact re-clamped into the window, exactly like
   *  any other motion, then becomes the working motion to tweak or save. */
  _loadPreset(id) {
    const preset = MOTION_PRESETS.find(p => p.id === id);
    if (!preset) return;
    this.motion = sanitizeMotion(preset.motion);
    if (this.motion.keyframes.length > MAX_KF) this.motion.keyframes = this.motion.keyframes.slice(0, MAX_KF);
    if (!this.motion.events.some(e => e.type === 'impact')) {
      this.motion.events.push({ t: (HIT_WINDOW.start + HIT_WINDOW.end) / 2, type: 'impact' });
    }
    for (const e of this.motion.events) if (e.type === 'impact') e.t = clamp(e.t, HIT_WINDOW.start, HIT_WINDOW.end);
    this.selKf = 0;
    this.scrubT = this.motion.keyframes[0]?.t || 0;
    this.playing = false;
    const dur = document.getElementById('meDuration'); if (dur) dur.value = String(this.motion.duration);
    const dv = document.getElementById('meDurationVal'); if (dv) dv.textContent = this.motion.duration.toFixed(2) + 's';
    const nm = document.getElementById('meName'); if (nm && !nm.value.trim()) nm.value = preset.name;
    this._setStatus(`프리셋 "${preset.name}" 적용됨. 그대로 저장하거나 관절을 끌어 다듬으세요.`);
    this._renderAll();
  }

  /**
   * Webcam pose capture (Phase D AI path). Records a short clip, retargets it to
   * the stick skeleton, and loads the result as the working motion to tweak/save.
   * Fully fail-soft: any error (no camera, denied, model down, no pose) just
   * shows a message and leaves the editor + presets untouched.
   */
  async _capture() {
    const btn = document.getElementById('meCapture');
    const video = document.getElementById('meVideo');
    if (this._capturing) return;
    this._capturing = true;
    if (btn) { btn.disabled = true; }
    this._setStatus('카메라 준비 중… 화면 앞에서 전신이 보이게 서서 동작을 취해 주세요.');
    try {
      const motion = await captureMotionFromWebcam(video, {
        durationMs: 1400,
        onProgress: (p) => this._setStatus(`포즈 캡처 중… ${Math.round(p * 100)}%`),
      });
      this.motion = motion;
      if (this.motion.keyframes.length > MAX_KF) this.motion.keyframes = this.motion.keyframes.slice(0, MAX_KF);
      for (const e of this.motion.events) if (e.type === 'impact') e.t = clamp(e.t, HIT_WINDOW.start, HIT_WINDOW.end);
      this.selKf = 0; this.scrubT = 0; this.playing = false;
      const dur = document.getElementById('meDuration'); if (dur) dur.value = String(this.motion.duration);
      const dv = document.getElementById('meDurationVal'); if (dv) dv.textContent = this.motion.duration.toFixed(2) + 's';
      this._setStatus('웹캠 모션을 가져왔습니다! 관절을 끌어 다듬거나 그대로 저장하세요.');
      this._renderAll();
    } catch (err) {
      const msg = {
        'camera-unavailable': '이 브라우저/기기에서 카메라를 쓸 수 없어요. 에디터와 프리셋으로 계속 만들 수 있습니다.',
        'camera-denied': '카메라 권한이 거부됐어요. 에디터와 프리셋은 그대로 사용할 수 있습니다.',
        'model-unavailable': 'AI 모델을 불러오지 못했어요(네트워크?). 에디터와 프리셋으로 계속하세요.',
        'no-pose-detected': '포즈를 인식하지 못했어요. 전신이 보이게 다시 시도하거나 프리셋을 쓰세요.',
      }[err?.message] || '웹캠 캡처에 실패했어요. 에디터와 프리셋은 정상 동작합니다.';
      this._setStatus('⚠ ' + msg);
    } finally {
      this._capturing = false;
      if (btn) btn.disabled = false;
    }
  }

  // --- Pose helpers ----------------------------------------------------------
  _displayPose() {
    if (this.playing) return samplePose(this.motion, this.scrubT);
    const kf = this.motion.keyframes[this.selKf];
    if (kf) return { ...STICK_NEUTRAL, ...kf.pose };   // exact selected keyframe
    return samplePose(this.motion, this.scrubT);
  }

  // --- Preview canvas --------------------------------------------------------
  _renderPreview() {
    const ctx = this.ctx; if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#14100b'; ctx.fillRect(0, 0, W, H);
    // ground line
    ctx.strokeStyle = '#3b3a44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H - 30); ctx.lineTo(W, H - 30); ctx.stroke();

    const scale = 46;
    const cx = W / 2, cyCenter = H - 30 - scale * 1.28; // body centre so feet sit on the ground line
    const pose = this._displayPose();
    const { joints, headR } = solveStickman(pose, scale, cx, cyCenter, 1, { rawNearArm: true, weapon: this.weapon });
    const color = this.look.color || WEAPON_STICK_COLOR[this.weapon] || '#cdd3da';
    drawStickFromJoints(ctx, joints, headR, { color, accent: '#0d0a06', lineW: this.look.lineW, scale, weapon: this.weapon, drawWeapon: true, aimAngle: 0, headShape: this.look.head, accessory: this.look.accessory });

    // Joint handles (only when a keyframe is selected & not playing).
    if (!this.playing && this.motion.keyframes[this.selKf]) {
      for (const h of HANDLES) {
        const p = joints[h.name]; if (!p) continue;
        const isWeapon = h.name === 'weaponTip';
        ctx.beginPath(); ctx.arc(p.x, p.y, isWeapon ? 7 : 6, 0, Math.PI * 2);
        ctx.fillStyle = this.dragHandle === h.name ? '#ffd24a' : (isWeapon ? 'rgba(255,160,80,0.9)' : 'rgba(125,240,154,0.85)');
        ctx.fill(); ctx.strokeStyle = '#0d0a06'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    this._jointCache = joints;
  }

  _previewDown(e) {
    if (this.playing || !this.motion.keyframes[this.selKf]) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (this.canvas.width / r.width);
    const my = (e.clientY - r.top) * (this.canvas.height / r.height);
    let best = null, bestD = 14 * 14;
    for (const h of HANDLES) {
      const p = this._jointCache?.[h.name]; if (!p) continue;
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestD) { bestD = d; best = h; }
    }
    if (best) { this.dragHandle = best.name; e.preventDefault(); }
  }

  _dragJointTo(e) {
    const h = HANDLES.find(x => x.name === this.dragHandle); if (!h) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (this.canvas.width / r.width);
    const my = (e.clientY - r.top) * (this.canvas.height / r.height);
    const parent = this._jointCache?.[h.parent]; if (!parent) return;
    // Editor is facing +1 / no flip, so screen angle == authored local angle.
    let deg = Math.atan2(my - parent.y, mx - parent.x) / DEG;
    deg = clamp(deg, MOTION_LIMITS.angleMin, MOTION_LIMITS.angleMax);
    const kf = this.motion.keyframes[this.selKf];
    kf.pose[h.joint] = Math.round(deg);
    this._renderPreview();
  }

  // --- Timeline --------------------------------------------------------------
  _renderTimeline() {
    const ctx = this.tctx; if (!ctx) return;
    const W = this.timeline.width, H = this.timeline.height;
    const pad = 10, x0 = pad, x1 = W - pad, span = x1 - x0;
    const tx = (t) => x0 + t * span;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0a06'; ctx.fillRect(0, 0, W, H);
    // Hit window band (fixed; guardrail).
    ctx.fillStyle = 'rgba(125,240,154,0.16)';
    ctx.fillRect(tx(HIT_WINDOW.start), 6, tx(HIT_WINDOW.end) - tx(HIT_WINDOW.start), H - 24);
    ctx.strokeStyle = 'rgba(125,240,154,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(tx(HIT_WINDOW.start), 6, tx(HIT_WINDOW.end) - tx(HIT_WINDOW.start), H - 24);
    ctx.fillStyle = '#7df09a'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('판정 창', (tx(HIT_WINDOW.start) + tx(HIT_WINDOW.end)) / 2, H - 4);
    // Track line.
    ctx.strokeStyle = '#3b3a44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, H / 2 - 4); ctx.lineTo(x1, H / 2 - 4); ctx.stroke();
    // Keyframes.
    this.motion.keyframes.forEach((kf, i) => {
      const x = tx(kf.t);
      ctx.fillStyle = i === this.selKf ? '#ffd24a' : '#e8d5a3';
      ctx.beginPath(); ctx.moveTo(x, H / 2 - 12); ctx.lineTo(x + 5, H / 2 - 4); ctx.lineTo(x - 5, H / 2 - 4); ctx.closePath(); ctx.fill();
    });
    // Impact marker.
    const imp = this.motion.events.find(e => e.type === 'impact');
    if (imp) {
      const x = tx(imp.t);
      ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, H - 16); ctx.stroke();
      ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(x, 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Playhead.
    if (this.playing) {
      const x = tx(this.scrubT);
      ctx.strokeStyle = '#45f3ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  _timelineT(e) {
    const r = this.timeline.getBoundingClientRect();
    const W = this.timeline.width, pad = 10;
    const x = (e.clientX - r.left) * (W / r.width);
    return clamp((x - pad) / (W - pad * 2), 0, 1);
  }

  _timelineDown(e) {
    const t = this._timelineT(e);
    const imp = this.motion.events.find(ev => ev.type === 'impact');
    // Grab the impact marker if close.
    if (imp && Math.abs(imp.t - t) < 0.04) { this.dragImpact = true; return; }
    // Grab the nearest keyframe if close, else scrub.
    let nearest = -1, nd = 0.05;
    this.motion.keyframes.forEach((kf, i) => { const d = Math.abs(kf.t - t); if (d < nd) { nd = d; nearest = i; } });
    if (nearest >= 0) { this.selKf = nearest; this.dragKfIndex = nearest; this.scrubT = this.motion.keyframes[nearest].t; }
    else { this.playing = false; this.scrubT = t; }
    this._renderAll();
  }

  _pointerMove(e) {
    if (this.dragHandle) { this._dragJointTo(e); return; }
    if (this.dragImpact) {
      const t = clamp(this._timelineT(e), HIT_WINDOW.start, HIT_WINDOW.end); // guardrail clamp
      const imp = this.motion.events.find(ev => ev.type === 'impact'); if (imp) imp.t = t;
      this._renderTimeline();
      return;
    }
    if (this.dragKfIndex >= 0) {
      const kf = this.motion.keyframes[this.dragKfIndex];
      kf.t = clamp(this._timelineT(e), 0, 1);
      this.scrubT = kf.t;
      this._renderAll();
    }
  }
  _pointerUp() {
    if (this.dragKfIndex >= 0) this.motion.keyframes.sort((a, b) => a.t - b.t);
    this.dragHandle = null; this.dragImpact = false; this.dragKfIndex = -1;
  }

  // --- Keyframe ops ----------------------------------------------------------
  _addKeyframe() {
    if (this.motion.keyframes.length >= MAX_KF) { this._setStatus(`키프레임은 최대 ${MAX_KF}개입니다.`); return; }
    const t = this.playing ? this.scrubT : clamp(this.scrubT, 0, 1);
    const pose = { ...samplePose(this.motion, t) };            // snapshot current look
    const kf = { t, pose };
    this.motion.keyframes.push(kf);
    this.motion.keyframes.sort((a, b) => a.t - b.t);
    this.selKf = this.motion.keyframes.indexOf(kf);
    this.playing = false;
    this._setStatus('키프레임 추가됨. 관절을 끌어 이 프레임의 포즈를 편집하세요.');
    this._renderAll();
  }
  _delKeyframe() {
    if (this.motion.keyframes.length <= 2) { this._setStatus('키프레임은 최소 2개 필요합니다.'); return; }
    this.motion.keyframes.splice(this.selKf, 1);
    this.selKf = Math.max(0, this.selKf - 1);
    this._renderAll();
  }

  // --- Playback --------------------------------------------------------------
  _togglePlay() {
    this.playing = !this.playing;
    document.getElementById('mePlay') && (document.getElementById('mePlay').textContent = this.playing ? '⏸ 정지' : '▶ 재생');
    if (this.playing) { this.scrubT = 0; this._lastT = performance.now(); this._loop(); }
    else if (this._raf) cancelAnimationFrame(this._raf);
    this._renderAll();
  }
  _loop() {
    if (!this.playing) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000); this._lastT = now;
    this.scrubT += dt / (this.motion.duration || 0.5);
    if (this.scrubT >= 1) this.scrubT = 0;   // loop the preview
    this._renderPreview(); this._renderTimeline();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  // --- Save / equip ----------------------------------------------------------
  _save() {
    const nameInput = document.getElementById('meName');
    const raw = (nameInput?.value || '').trim() || `${this.weapon}-커스텀`;
    const slug = raw.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'custom';
    const id = `user:${this.weapon}:${slug}`;
    // The set overrides ONLY the attack motion; everything else falls back to the
    // weapon default. Sanitize before storing + registering (guardrail).
    const set = { attack: sanitizeMotion(this.motion) };
    registerMotionSet(id, set);
    let store = {};
    try { store = JSON.parse(localStorage.getItem(STORE_SETS) || '{}') || {}; } catch {}
    store[id] = set;
    try {
      localStorage.setItem(STORE_SETS, JSON.stringify(store));
      localStorage.setItem(STORE_EQUIP, id);                 // auto-equip the just-saved motion
    } catch {}
    this._setStatus(`저장 + 장착 완료: "${raw}". 다음 매치부터 ${this.weapon}에 적용됩니다.`);
  }

  _setStatus(t) { const el = document.getElementById('meStatus'); if (el) el.textContent = t; }
  _renderAll() { this._renderPreview(); this._renderTimeline(); }
}
