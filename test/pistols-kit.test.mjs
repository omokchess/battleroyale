import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig, AuxSkillConfig } from '../game/Weapons.js';

test('pistols base buff: 11 dmg / 180ms / spread 3 / range 290', () => {
  const p = Weapons.pistols;
  assert.equal(p.damage, 11);
  assert.equal(p.cooldown, 180);
  assert.equal(p.spreadDeg, 3);
  assert.equal(p.range, 290);
  assert.equal(SkillConfig.pistols.burstCount, 10); // F 난사 8→10
});

test('pistols aux kit: 조준사격(aimed_shot)/구르기장전(dodge_reload)', () => {
  assert.equal(AuxSkillConfig.pistols.alt.type, 'aimed_shot');
  assert.equal(AuxSkillConfig.pistols.target.type, 'dodge_reload');
});

test('조준 사격 resolves a piercing hit after the windup', () => {
  const owner = new Player('o', 'Aim', 'pistols', 100, 100); owner.angle = 0;
  const a = new Player('a', 'A', 'sword', 200, 100);
  const b = new Player('b', 'B', 'sword', 300, 100); // both in line → pierce hits both
  const g = Object.create(Game.prototype);
  g.players = { o: owner, a, b };
  g.effects = []; g.cover = [];
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  const cfg = AuxSkillConfig.pistols.alt;
  g._executeAuxSkill(owner, cfg, 1000, 'alt');
  // before windup elapses: no damage yet
  g._processAimedShots(1000 + cfg.windupMs - 50);
  assert.equal(a.hp, a.maxHp, 'no damage during windup');
  // after windup: both in-line foes take the piercing shot
  const ah = a.hp, bh = b.hp;
  g._processAimedShots(1000 + cfg.windupMs + 10);
  assert.ok(a.hp < ah && b.hp < bh, 'piercing shot hit both foes in the line');
});

test('구르기 장전 grants iframes + a fire-rate buff', () => {
  const owner = new Player('o', 'Roll', 'pistols', 100, 100); owner.angle = 0;
  const g = Object.create(Game.prototype);
  g.players = { o: owner };
  const now = 5000;
  g._executeAuxSkill(owner, AuxSkillConfig.pistols.target, now, 'target');
  assert.ok(owner.iframeTimeLeft > 0, 'roll gave i-frames');
  assert.ok(owner.pistolReloadUntil > now, 'roll set the rapid-fire window');
  // buffed fire rate: cooldown shrinks to 70% (180 → 126ms)
  owner.lastAttackTime = now;
  assert.equal(owner.canAttack(now + 130), true);   // would be false at full 180ms cd
});
