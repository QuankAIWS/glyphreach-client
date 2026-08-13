import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROTOCOL_VERSION,
  createHello,
  createMoveTarget,
  createStartGathering,
  parseServerMessage,
} from '../src/protocol/v1';

test('HELLO is pinned to the public protocol version', () => {
  assert.deepEqual(createHello('client-sha'), {
    type: 'HELLO',
    protocolVersion: PROTOCOL_VERSION,
    clientBuild: 'client-sha',
  });
});

test('click movement and Mining are expressed as intent rather than authoritative results', () => {
  assert.deepEqual(createMoveTarget(4, { x: 700, y: 300 }), {
    type: 'MOVE_TARGET',
    sequence: 4,
    target: { x: 700, y: 300 },
  });
  assert.deepEqual(createStartGathering(5, 'copper-vein-alpha-1', 'steady'), {
    type: 'START_GATHERING',
    sequence: 5,
    nodeId: 'copper-vein-alpha-1',
    mode: 'steady',
  });
});

test('WELCOME parsing accepts authoritative world, resource, inventory, and skill state', () => {
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
    progress: {
      inventory: { capacity: 24, slots: [] },
      skills: { mining: { xp: 0, level: 1 } },
      gathering: null,
    },
    world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } },
  }));
  assert.equal(message.type, 'WELCOME');
  if (message.type === 'WELCOME') {
    assert.equal(message.player.id, 'player-1');
    assert.equal(message.resources[0]?.kind, 'copper_vein');
    assert.equal(message.progress.skills.mining.level, 1);
  }
});

test('malformed server messages are rejected', () => {
  assert.throws(() => parseServerMessage('{"type":"WELCOME"}'), /Malformed WELCOME/);
});
