import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { NetworkManager } from '../multiplayer/NetworkManager.js';
import { MsgType, Protocol } from '../multiplayer/Protocol.js';

class FakeEmitter {
  constructor() {
    this.handlers = new Map();
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  emit(event, ...args) {
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
  }
}

class FakeConnection extends FakeEmitter {
  constructor(peerId) {
    super();
    this.peer = peerId;
    this.open = false;
    this.sent = [];
    this.closed = false;
  }

  send(payload) {
    if (!this.open) {
      throw new Error('connection is not open');
    }
    this.sent.push(payload);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit('close');
  }
}

class FakePeer extends FakeEmitter {
  static instances = [];

  constructor(id) {
    super();
    this.id = id || `peer-${FakePeer.instances.length + 1}`;
    this.destroyed = false;
    this.disconnected = false;
    this.lastConnection = null;
    this.lastConnectId = null;
    this.reconnectCount = 0;
    FakePeer.instances.push(this);
  }

  connect(peerId) {
    this.lastConnectId = peerId;
    this.lastConnection = new FakeConnection(peerId);
    return this.lastConnection;
  }

  reconnect() {
    this.reconnectCount++;
    this.disconnected = false;
  }

  disconnect() {
    this.disconnected = true;
  }

  destroy() {
    this.destroyed = true;
  }
}

beforeEach(() => {
  FakePeer.instances = [];
  globalThis.window = { Peer: FakePeer };
});

afterEach(() => {
  delete globalThis.window;
});

test('emits all registered listeners for the same event', () => {
  const network = new NetworkManager();
  const errors = [];

  network.on('onError', (message) => errors.push(`first:${message}`));
  network.on('onError', (message) => errors.push(`second:${message}`));

  network.hostRoom('AB');

  assert.deepEqual(errors, [
    'first:Room code must be at least 3 characters.',
    'second:Room code must be at least 3 characters.'
  ]);
});

test('joining a missing room fails instead of waiting forever', () => {
  const network = new NetworkManager();
  const errors = [];

  network.on('onError', (message) => errors.push(message));
  network.joinRoom('ghost', Protocol.joinRoom('Guest', 'sword'));

  const peer = FakePeer.instances.at(-1);
  peer.emit('open', 'guest-peer');
  assert.equal(peer.lastConnectId, 'ais-br-bg-room-GHOST');

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    peer.emit('error', { type: 'peer-not-found', message: 'Could not connect to peer' });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(network.stopped, true);
  assert.equal(Object.keys(network.connections).length, 0);
  assert.match(errors.at(-1), /not found/i);
});

test('host accepts join packets and responds to client pings', () => {
  const network = new NetworkManager();
  let joinedPlayer = null;

  network.on('onPlayerJoined', (remoteId, payload) => {
    joinedPlayer = { remoteId, payload };
  });

  network.hostRoom('arena');
  const peer = FakePeer.instances.at(-1);
  peer.emit('open', 'ais-br-bg-room-ARENA');

  const conn = new FakeConnection('guest-peer');
  conn.open = true;
  peer.emit('connection', conn);
  conn.emit('data', Protocol.joinRoom('Guest', 'bow'));
  conn.emit('data', { type: MsgType.PING, seq: 7 });

  assert.equal(joinedPlayer.remoteId, 'guest-peer');
  assert.equal(joinedPlayer.payload.weapon, 'bow');
  assert.deepEqual(conn.sent.at(-1), { type: MsgType.PONG, seq: 7 });

  network.stop({ notifyGuests: false });
});

test('client marks the room as joined only after ROOM_JOINED arrives', () => {
  const network = new NetworkManager();
  const received = [];

  network.on('onData', (fromId, data) => received.push({ fromId, data }));
  network.joinRoom('arena', Protocol.joinRoom('Guest', 'sword'));

  const peer = FakePeer.instances.at(-1);
  peer.emit('open', 'guest-peer');

  const conn = peer.lastConnection;
  conn.open = true;
  conn.emit('open');

  assert.equal(network.hasConnectedToHost, true);
  assert.equal(network.hasJoinedRoom, false);

  conn.emit('data', Protocol.roomJoined('guest-peer', {}, 700, 700));

  assert.equal(network.hasJoinedRoom, true);
  assert.equal(received.at(-1).data.type, MsgType.ROOM_JOINED);

  network.stop({ notifyGuests: false });
});
