import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../game/Game.js';
import { Player } from '../game/Player.js';
import { Weapons, SkillConfig, AuxSkillConfig } from '../game/Weapons.js';

function makeGame(players) {
  const g = Object.create(Game.prototype);
  g.players = players;
  g.mines = []; g.effects = []; g._mineSeq = 0;
  g.mapWidth = 700; g.mapHeight = 700;
  g._creditKill = () => {};
  return g;
}

test('minebag base buff: 14 dmg / 450ms; blast 42 + slow', () => {
  assert.equal(Weapons.minebag.damage, 14);
  assert.equal(Weapons.minebag.cooldown, 450);
  assert.equal(SkillConfig.minebag.damage, 42);
  assert.ok(SkillConfig.minebag.blastSlowMs > 0);
});

test('minebag aux kit: 설치(place) on R, 예광지뢰(tracer) on LMB', () => {
  assert.equal(AuxSkillConfig.minebag.alt.type, 'place_mine');
  assert.equal(AuxSkillConfig.minebag.target.type, 'tracer_mine');
});

test('F 원격 기폭 detonates all the player\'s mines at once', () => {
  const owner = new Player('o', 'Boom', 'minebag', 100, 100);
  const victim = new Player('t', 'T', 'sword', 110, 100);
  const g = makeGame({ o: owner, t: victim });
  g._placeMine(owner, 1000);
  g._placeMine(owner, 1000);
  assert.equal(g.mines.length, 2);
  const before = victim.hp;
  g._detonateAllMines(owner, 2000);
  assert.equal(g.mines.length, 0, 'all mines consumed');
  assert.ok(victim.hp < before, 'remote detonation damaged the nearby enemy');
});

test('minebag F activation path triggers remote detonation', () => {
  const owner = new Player('o', 'Boom', 'minebag', 100, 100);
  const victim = new Player('t', 'T', 'sword', 110, 100);
  const g = makeGame({ o: owner, t: victim });
  g._placeMine(owner, 1000);
  const before = victim.hp;
  g._activateSkill(owner, 2000);
  assert.equal(g.mines.length, 0, 'F consumed the placed mine');
  assert.ok(victim.hp < before, 'F damaged the nearby enemy');
});

test('LMB 예광 지뢰 sticks to a foe and bursts after the fuse (+stun)', () => {
  const owner = new Player('o', 'Tracer', 'minebag', 100, 100); owner.angle = 0;
  const foe = new Player('t', 'T', 'sword', 160, 100);
  const g = makeGame({ o: owner, t: foe });
  g._placeTracerMine(owner, 1000);
  const m = g.mines[0];
  assert.ok(m.tracer && m.stickTo === 't', 'tracer stuck to the foe');
  // foe moves; mine follows on update, then fuses
  foe.x = 300; foe.y = 100;
  g._updateMines(1500);
  assert.equal(m.x, 300, 'tracer followed the stuck target');
  const before = foe.hp;
  g._updateMines(1000 + SkillConfig.minebag.tracerFuseMs);
  assert.ok(foe.hp < before, 'tracer burst damaged the foe');
  assert.ok(foe.stunTimeLeft > 0, 'tracer burst stunned the foe');
});
