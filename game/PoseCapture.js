/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Webcam pose capture (Phase D, AI path) — entirely client-side. Uses MediaPipe
 * Tasks-Vision PoseLandmarker (loaded from a CDN at runtime) to turn a short
 * webcam clip into stick-skeleton keyframes, retargeted into the SAME cosmetic
 * motion schema (Motion.js) the editor/presets use. Nothing here is gameplay:
 * the result is sanitized like any motion and only chooses joint angles.
 *
 * Fail-soft is mandatory (spec): if the model can't load or the camera is denied,
 * every function degrades gracefully (returns null / throws a tagged error) so
 * the editor keeps working with manual posing + presets.
 *
 * The landmark→pose math is a pure function (landmarksToPose) so it is unit-
 * tested without a camera or model.
 */

import { sanitizeMotion } from './Motion.js';

// MediaPipe Pose 33-landmark indices we use.
const LM = {
  nose: 0,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28,
};

const DEG = 180 / Math.PI;
const clampAng = (d) => Math.max(-360, Math.min(360, Math.round(d)));
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const ang = (from, to) => Math.atan2(to.y - from.y, to.x - from.x) * DEG;

/**
 * Convert one frame of MediaPipe landmarks (normalized {x,y}) into a stick pose
 * (absolute degrees, the editor's joint set). The subject's RIGHT side is the
 * near (weapon) arm/leg, LEFT is the far side. Image coords are y-down, matching
 * our angle convention, so atan2 maps directly. Returns null if key joints are
 * missing/low-confidence. `mirror` flips X for a selfie-view camera.
 */
export function landmarksToPose(landmarks, { mirror = true } = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) return null;
  const g = (i) => {
    const p = landmarks[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    // visibility gate when present
    if (Number.isFinite(p.visibility) && p.visibility < 0.3) return null;
    return { x: mirror ? (1 - p.x) : p.x, y: p.y };
  };
  const need = ['nose', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR',
    'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
  const P = {};
  for (const k of need) { const p = g(LM[k]); if (!p) return null; P[k] = p; }

  const neck = mid(P.shoulderL, P.shoulderR);
  const pelvis = mid(P.hipL, P.hipR);

  return {
    spine: clampAng(ang(pelvis, neck)),
    head: clampAng(ang(neck, P.nose)),
    // Near = subject right (R indices); far = subject left.
    armNearU: clampAng(ang(P.shoulderR, P.elbowR)),
    armNearL: clampAng(ang(P.elbowR, P.wristR)),
    armFarU: clampAng(ang(P.shoulderL, P.elbowL)),
    armFarL: clampAng(ang(P.elbowL, P.wristL)),
    legNearU: clampAng(ang(P.hipR, P.kneeR)),
    legNearL: clampAng(ang(P.kneeR, P.ankleR)),
    legFarU: clampAng(ang(P.hipL, P.kneeL)),
    legFarL: clampAng(ang(P.kneeL, P.ankleL)),
  };
}

/**
 * Turn a sequence of captured poses into a sanitized motion. Evenly downsamples
 * to ≤ maxKeyframes, spreads t over [0,1], and drops an impact marker near the
 * mid of the clip (clamped later by the editor's window). Returns a safe motion.
 */
export function posesToMotion(poses, durationSec = 0.8, maxKeyframes = 8) {
  const clean = (poses || []).filter(Boolean);
  if (clean.length < 2) return null;
  const n = Math.min(maxKeyframes, clean.length);
  const keyframes = [];
  for (let i = 0; i < n; i++) {
    const src = clean[Math.round((i / (n - 1)) * (clean.length - 1))];
    keyframes.push({ t: n === 1 ? 0 : i / (n - 1), pose: { ...src } });
  }
  return sanitizeMotion({
    duration: Math.max(0.2, Math.min(1.5, durationSec)),
    loop: false,
    keyframes,
    events: [{ t: 0.5, type: 'impact' }],
  });
}

// Avoid Vite statically analysing / bundling the CDN module — resolve at runtime.
const dynImport = (u) => (new Function('u', 'return import(u)'))(u);
const TASKS_VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/** Load the PoseLandmarker from CDN. Returns the landmarker or null (fail-soft). */
export async function loadPoseLandmarker() {
  try {
    const vision = await dynImport(`${CDN}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    return await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'VIDEO', numPoses: 1,
    });
  } catch (e) {
    console.warn('PoseLandmarker load failed (fail-soft):', e?.message || e);
    return null;
  }
}

/**
 * Run a short capture: open the camera into `videoEl`, detect poses for
 * `durationMs`, and resolve a sanitized motion. Rejects with a tagged Error on
 * any failure so the caller can fall back to manual/preset editing.
 * `onProgress(0..1)` is optional.
 */
export async function captureMotionFromWebcam(videoEl, { durationMs = 1200, onProgress } = {}) {
  if (!videoEl || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('camera-unavailable');
  }
  let stream = null;
  let landmarker = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
  } catch { throw new Error('camera-denied'); }
  try {
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    landmarker = await loadPoseLandmarker();
    if (!landmarker) throw new Error('model-unavailable');

    const poses = [];
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - start;
        if (onProgress) onProgress(Math.min(1, elapsed / durationMs));
        try {
          const res = landmarker.detectForVideo(videoEl, performance.now());
          const lm = res?.landmarks?.[0];
          if (lm) { const pose = landmarksToPose(lm); if (pose) poses.push(pose); }
        } catch { /* skip a bad frame */ }
        if (elapsed >= durationMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const motion = posesToMotion(poses, durationMs / 1000);
    if (!motion) throw new Error('no-pose-detected');
    return motion;
  } finally {
    try { stream?.getTracks().forEach(t => t.stop()); } catch {}
    try { videoEl.srcObject = null; } catch {}
    try { landmarker?.close?.(); } catch {}
  }
}
