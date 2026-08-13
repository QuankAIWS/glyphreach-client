import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROTOCOL_VERSION,
  createAttackTarget,
  createBankDeposit,
  createHello,
  createMoveTarget,
  createStartGathering,
  createStartProcessing,
  parseServerMessage,
} from '../src/protocol/v1';

test('HELLO is pinned to the public protocol version', () => {
  assert.deepEqual(createHello('client-sha'), { type: 'HELLO', protocolVersion: PROTOCOL_VERSION, clientBuild: 'client-sha' });
});

test('movement, skilling, economy, and combat remain intents rather than authoritative results', () => {
  assert.deepEqual(createMoveTarget(4, { x: 700, y: 300 }), { type: 'MOVE_TARGET', sequence: 4, target: { x: 700, y: 300 } });
  assert.deepEqual(createStartGathering(5, 'copper-vein-alpha-1', 'steady'), { type: 'START_GATHERING', sequence: 5, nodeId: 'copper-vein-alpha-1', mode: 'steady' });
  assert.deepEqual(createStartProcessing(6, 'furnace-alpha-1', 'smelt_copper'), { type: 'START_PROCESSING', sequence: 6, stationId: 'furnace-alpha-1', recipeId: 'smelt_copper' });
  assert.deepEqual(createBankDeposit(7, 'bank-alpha-1', 'copper_ore', 1), { type: 'BANK_DEPOSIT', sequence: 7, serviceId: 'bank-alpha-1', itemId: 'copper_ore', quantity: 1 });
  assert.deepEqual(createAttackTarget(8, 'reach-rat-alpha-1'), { type: 'ATTACK_TARGET', sequence: 8, targetId: 'reach-rat-alpha-1' });
});

test('WELCOME accepts authoritative services, storage, equipment, enemy state, and combat state', () => {
  const message = parseServerMessage(JSON.stringify({
    type: 'WELCOME',
    protocolVersion: 1,
    serverBuild: 'server-sha',
    connectionId: 'connection-1',
    resumeToken: 'token-1',
    worldId: 'alpha-1',
    player: { id: 'player-1', position: { x: 500, y: 300 } },
    players: [{ id: 'player-1', position: { x: 500, y: 300 } }],
    resources: [{ id: 'copper-vein-alpha-1', kind: 'copper_vein', position: { x: 760, y: 300 }, available: true, respawnAt: null }],
    stations: [{ id: 'furnace-alpha-1', kind: 'furnace', position: { x: 570, y: 155 } }, { id: 'anvil-alpha-1', kind: 'anvil', position: { x: 570, y: 445 } }],
    services: [
      { id: 'bank-alpha-1', kind: 'bank', position: { x: 300, y: 180 } },
      { id: 'merchant-alpha-1', kind: 'merchant', position: { x: 300, y: 420 }, offers: [{ itemId: 'copper_ore', buyPrice: 4, sellPrice: 2 }] },
    ],
    progress: {
      inventory: { capacity: 24, slots: [] },
      bank: { capacity: 60, slots: [] },
      wallet: { coins: 0 },
      equipment: { toolItemId: null },
      skills: { mining: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 } },
      gathering: null,
      processing: null,
    },
    enemies: [{ id: 'reach-rat-alpha-1', kind: 'reach_rat', position: { x: 820, y: 470 }, health: 14, maxHealth: 14, alive: true, respawnAt: null }],
    combat: {
      health: { current: 20, max: 20, dead: false, respawnAt: null },
      skill: { xp: 0, level: 1 },
      equipment: { weaponItemId: null },
    },
    world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } },
  }));
  assert.equal(message.type, 'WELCOME');
  if (message.type === 'WELCOME') {
    assert.equal(message.services.length, 2);
    assert.equal(message.progress.bank.capacity, 60);
    assert.equal(message.enemies[0]?.health, 14);
    assert.equal(message.combat.health.current, 20);
  }
});

test('combat state messages and rejections are validated', () => {
  const world = parseServerMessage(JSON.stringify({
    type: 'COMBAT_WORLD_STATE',
    revision: 2,
    enemies: [{ id: 'reach-rat-alpha-1', kind: 'reach_rat', position: { x: 820, y: 470 }, health: 8, maxHealth: 14, alive: true, respawnAt: null }],
  }));
  assert.equal(world.type, 'COMBAT_WORLD_STATE');

  const player = parseServerMessage(JSON.stringify({
    type: 'COMBAT_PLAYER_STATE',
    revision: 3,
    combat: { health: { current: 5, max: 20, dead: false, respawnAt: null }, skill: { xp: 0, level: 1 }, equipment: { weaponItemId: null } },
  }));
  assert.equal(player.type, 'COMBAT_PLAYER_STATE');

  const rejected = parseServerMessage(JSON.stringify({ type: 'ACTION_REJECTED', action: 'combat', reason: 'cooldown' }));
  assert.equal(rejected.type, 'ACTION_REJECTED');
});

test('malformed server messages are rejected', () => {
  assert.throws(() => parseServerMessage('{"type":"WELCOME"}'), /Malformed WELCOME/);
  assert.throws(() => parseServerMessage('{"type":"COMBAT_PLAYER_STATE","revision":1,"combat":{}}'), /Malformed COMBAT_PLAYER_STATE/);
});
