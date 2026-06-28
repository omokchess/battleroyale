/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Motion preset library (Phase D, main path — no ML). A curated set of attack
 * motions the player can apply to their stick character instantly: pick one and
 * it's "drawn → moving" with zero authoring. Because every character shares the
 * same skeleton, retargeting a preset is just adopting its (skeleton-relative)
 * pose angles — no rig solving needed.
 *
 * Each preset is the SAME cosmetic schema as the editor/AI output (see Motion.js)
 * and is re-sanitized on use, so presets obey the exact same guardrails: they
 * only choose joint angles + an impact frame, never gameplay values.
 *
 * The near (weapon) arm follows the aim at render time, so these motions shape
 * the torso / legs / off-arm for weight and read; impact marks the swing apex.
 */

// Raw preset definitions (absolute degrees; see Stickman.js). impact placed
// inside the editor's fixed hit window (0.3–0.7).
export const MOTION_PRESETS = [
  {
    id: 'preset:slash', name: '횡베기',
    motion: {
      duration: 0.4, loop: false,
      keyframes: [
        { t: 0,   pose: { spine: -86, armFarU: 120, legNearU: 82, legFarU: 98 } },
        { t: 0.3, pose: { spine: -78, armFarU: 70 } },
        { t: 0.5, pose: { spine: -98, armFarU: 55, legNearU: 72, legFarU: 108 } },
        { t: 1,   pose: { spine: -88, armFarU: 112, legNearU: 84, legFarU: 96 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:thrust', name: '찌르기',
    motion: {
      duration: 0.32, loop: false,
      keyframes: [
        { t: 0,    pose: { spine: -94, legNearU: 82, legFarU: 100, armFarU: 122 } },
        { t: 0.35, pose: { spine: -84, legNearU: 62, legFarU: 114 } },
        { t: 0.5,  pose: { spine: -78, legNearU: 56, legFarU: 118, armFarU: 78 } },
        { t: 1,    pose: { spine: -90, legNearU: 84, legFarU: 96, armFarU: 110 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:overhead', name: '내려치기',
    motion: {
      duration: 0.6, loop: false,
      keyframes: [
        { t: 0,    pose: { spine: -84, armFarU: 150, legNearU: 86, legFarU: 92 } },
        { t: 0.35, pose: { spine: -68, armFarU: 178, legNearU: 92, legFarU: 84 } },
        { t: 0.55, pose: { spine: -110, armFarU: 45, legNearU: 64, legFarU: 112 } },
        { t: 1,    pose: { spine: -88, armFarU: 120, legNearU: 84, legFarU: 96 } },
      ],
      events: [{ t: 0.55, type: 'impact' }],
    },
  },
  {
    id: 'preset:uppercut', name: '올려베기',
    motion: {
      duration: 0.46, loop: false,
      keyframes: [
        { t: 0,    pose: { spine: -104, legNearU: 64, legNearL: 110, legFarU: 110, armFarU: 70 } },
        { t: 0.35, pose: { spine: -100, legNearU: 70, armFarU: 60 } },
        { t: 0.55, pose: { spine: -74, legNearU: 92, legNearL: 92, armFarU: 140 } },
        { t: 1,    pose: { spine: -88, legNearU: 84, legFarU: 96, armFarU: 110 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:spin', name: '회전베기',
    motion: {
      duration: 0.55, loop: false,
      keyframes: [
        { t: 0,   pose: { spine: -90, armFarU: 110, legNearU: 84, legFarU: 96 } },
        { t: 0.3, pose: { spine: -60, armFarU: 30, legNearU: 60, legFarU: 120 } },
        { t: 0.5, pose: { spine: -120, armFarU: -10, legNearU: 110, legFarU: 70 } },
        { t: 0.7, pose: { spine: -90, armFarU: 200, legNearU: 84, legFarU: 96 } },
        { t: 1,   pose: { spine: -88, armFarU: 110, legNearU: 84, legFarU: 96 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:flurry', name: '연타',
    motion: {
      duration: 0.42, loop: false,
      keyframes: [
        { t: 0,    pose: { spine: -90, armFarU: 110, legNearU: 80, legFarU: 100 } },
        { t: 0.25, pose: { spine: -84, armFarU: 70 } },
        { t: 0.4,  pose: { spine: -94, armFarU: 130, legNearU: 76 } },
        { t: 0.6,  pose: { spine: -84, armFarU: 70 } },
        { t: 1,    pose: { spine: -90, armFarU: 110, legNearU: 84, legFarU: 96 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:kick', name: '발차기',
    motion: {
      duration: 0.4, loop: false,
      keyframes: [
        { t: 0,   pose: { spine: -92, legNearU: 84, legNearL: 90, armFarU: 110 } },
        { t: 0.3, pose: { spine: -100, legNearU: 70, legNearL: 80 } },
        { t: 0.5, pose: { spine: -84, legNearU: 30, legNearL: 30, legFarU: 100 } },
        { t: 1,   pose: { spine: -90, legNearU: 84, legNearL: 90, legFarU: 96 } },
      ],
      events: [{ t: 0.5, type: 'impact' }],
    },
  },
  {
    id: 'preset:smash', name: '강타',
    motion: {
      duration: 0.62, loop: false,
      keyframes: [
        { t: 0,   pose: { spine: -74, armFarU: 165, legNearU: 92, legFarU: 80 } },
        { t: 0.4, pose: { spine: -62, armFarU: 185, legNearU: 96, legFarU: 76 } },
        { t: 0.6, pose: { spine: -116, armFarU: 30, legNearU: 60, legFarU: 116 } },
        { t: 1,   pose: { spine: -88, armFarU: 120, legNearU: 84, legFarU: 96 } },
      ],
      events: [{ t: 0.6, type: 'impact' }],
    },
  },
];

export function getPreset(id) {
  return MOTION_PRESETS.find(p => p.id === id) || null;
}
