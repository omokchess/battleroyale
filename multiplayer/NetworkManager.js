/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MsgType } from './Protocol.js';

const ROOM_PREFIX = 'ais-br-bg-room-';
const INIT_TIMEOUT_MS = 12000;
const CONNECT_TIMEOUT_MS = 10000;
const HANDSHAKE_TIMEOUT_MS = 10000;
const RECONNECT_DELAY_MS = 3000;
const PING_INTERVAL_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 8000;

const EVENTS = [
  'onInit',
  'onError',
  'onConnected',
  'onPlayerJoined',
  'onPlayerLeft',
  'onData',
  'onDisconnected'
];

export class NetworkManager {
  constructor() {
    this.callbacks = {};
    EVENTS.forEach(event => {
      this.callbacks[event] = new Set();
    });

    this.sessionId = 0;
    this._resetRuntimeState(true);
  }

  _resetRuntimeState(markStopped = false) {
    this.peer = null;
    this.isHost = false;
    this.roomCode = '';
    this.localId = null;
    this.hostPeerId = null;
    this.connections = {};
    this.timers = {};
    this.isStopping = false;
    this.stopped = markStopped;
    this.hasConnectedToHost = false;
    this.hasJoinedRoom = false;
    this.hostDisconnectNotified = false;
    this.pingSequence = 0;
    this.pendingPings = new Map();
    this.lastPongAt = 0;
    this.latency = 0;
  }

  on(event, callback) {
    if (!this.callbacks.hasOwnProperty(event) || typeof callback !== 'function') {
      return () => {};
    }

    this.callbacks[event].add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event].delete(callback);
    }
  }

  _emit(event, ...args) {
    const listeners = this.callbacks[event];
    if (!listeners) return;

    [...listeners].forEach(listener => {
      try {
        listener(...args);
      } catch (err) {
        console.error(`NetworkManager listener failed for ${event}:`, err);
      }
    });
  }

  _getPeerClass() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root && root.Peer) return root.Peer;
    if (typeof Peer !== 'undefined') return Peer;
    throw new Error('PeerJS is not loaded. Check the PeerJS CDN script or network connection.');
  }

  _normalizeRoomCode(roomCode) {
    return String(roomCode || '').trim().toUpperCase();
  }

  _prefixRoom(roomCode) {
    return `${ROOM_PREFIX}${this._normalizeRoomCode(roomCode)}`;
  }

  _peerOptions() {
    return {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };
  }

  _createPeer(id) {
    const PeerClass = this._getPeerClass();
    return new PeerClass(id, this._peerOptions());
  }

  _beginSession(isHost, roomCode) {
    this.stop({ notifyGuests: false });
    this.sessionId++;
    this._resetRuntimeState(false);
    this.isHost = isHost;
    this.roomCode = this._normalizeRoomCode(roomCode);
    return this.sessionId;
  }

  _isCurrentSession(session) {
    return session === this.sessionId && !this.stopped && !this.isStopping;
  }

  _setTimer(name, session, callback, delay) {
    this._clearTimer(name);
    this.timers[name] = setTimeout(() => {
      delete this.timers[name];
      if (this._isCurrentSession(session)) {
        callback();
      }
    }, delay);
  }

  _clearTimer(name) {
    if (this.timers[name]) {
      clearTimeout(this.timers[name]);
      delete this.timers[name];
    }
  }

  _clearTimers() {
    Object.keys(this.timers).forEach(name => this._clearTimer(name));
  }

  _safeSend(conn, payload, allowDuringStop = false) {
    if (!conn || (!allowDuringStop && (this.stopped || this.isStopping))) {
      return false;
    }

    if (!conn.open) {
      return false;
    }

    try {
      conn.send(payload);
      return true;
    } catch (err) {
      console.warn('Failed to send network packet:', err);
      return false;
    }
  }

  _schedulePeerReconnect(session) {
    if (!this._isCurrentSession(session) || !this.peer || this.peer.destroyed) return;

    this._setTimer('reconnect', session, () => {
      if (!this._isCurrentSession(session) || !this.peer || this.peer.destroyed) return;
      if (!this.peer.disconnected) return;

      try {
        this.peer.reconnect();
      } catch (err) {
        console.warn('PeerJS reconnect failed:', err);
      }
    }, RECONNECT_DELAY_MS);
  }

  _isRecoverableSignalingError(err) {
    const type = err?.type || '';
    const msg = String(err?.message || '').toLowerCase();
    return (
      ['socket-error', 'socket-closed', 'disconnected', 'network'].includes(type) ||
      msg.includes('lost connection') ||
      msg.includes('socket error') ||
      msg.includes('websocket') ||
      msg.includes('disconnected')
    );
  }

  _formatPeerError(err, fallback) {
    const type = err?.type || '';
    const message = err?.message || type || fallback;

    if (type === 'unavailable-id') {
      return `Room code "${this.roomCode}" is already in use. Choose another code.`;
    }
    if (type === 'peer-not-found' || type === 'peer-unavailable') {
      return `Room code "${this.roomCode}" was not found. Check the code and try again.`;
    }
    if (type === 'webrtc') {
      return 'Could not establish a WebRTC connection to the host.';
    }
    if (type === 'browser-incompatible') {
      return 'This browser does not support the WebRTC features required for multiplayer.';
    }

    return message;
  }

  _handlePeerError(err, role, session) {
    if (!this._isCurrentSession(session)) return;

    const logPeerError = role === 'client' && !this.hasJoinedRoom ? console.warn : console.error;
    logPeerError(`Peer ${role} level error:`, err);

    if (role === 'host') {
      if (!this.localId || err?.type === 'unavailable-id') {
        this._emit('onError', `Failed to create room. ${this._formatPeerError(err, 'Unknown host error.')}`);
        this.stop({ notifyGuests: false });
        return;
      }

      if (this._isRecoverableSignalingError(err)) {
        this._schedulePeerReconnect(session);
        return;
      }

      this._emit('onError', this._formatPeerError(err, 'Unknown host error.'));
      return;
    }

    if (!this.hasJoinedRoom) {
      this._emit('onError', `Failed to join room. ${this._formatPeerError(err, 'Unknown join error.')}`);
      this.stop({ notifyGuests: false });
      return;
    }

    if (this._isRecoverableSignalingError(err)) {
      this._schedulePeerReconnect(session);
      return;
    }

    this._handleHostDisconnected('Connection to the host was interrupted.');
  }

  hostRoom(roomCode) {
    const normalizedRoomCode = this._normalizeRoomCode(roomCode);
    if (normalizedRoomCode.length < 3) {
      this._emit('onError', 'Room code must be at least 3 characters.');
      return;
    }

    const session = this._beginSession(true, normalizedRoomCode);
    const targetPeerId = this._prefixRoom(this.roomCode);

    try {
      this.peer = this._createPeer(targetPeerId);
    } catch (err) {
      this._emit('onError', err.message);
      this.stop({ notifyGuests: false });
      return;
    }

    this._setTimer('init', session, () => {
      this._emit('onError', 'Timed out while creating the room. Please try another room code.');
      this.stop({ notifyGuests: false });
    }, INIT_TIMEOUT_MS);

    this.peer.on('open', (id) => {
      if (!this._isCurrentSession(session)) return;

      this._clearTimer('init');
      this.localId = id;
      this._emit('onInit', this.roomCode);
      this._emit('onConnected');
    });

    this.peer.on('connection', (conn) => {
      if (!this._isCurrentSession(session)) return;
      this._setupHostConnection(conn, session);
    });

    this.peer.on('disconnected', () => {
      if (!this._isCurrentSession(session)) return;
      console.warn('Peer host disconnected from the signaling server. Attempting silent reconnect...');
      this._schedulePeerReconnect(session);
    });

    this.peer.on('error', (err) => this._handlePeerError(err, 'host', session));
  }

  _setupHostConnection(conn, session) {
    const remoteId = conn.peer;
    this.connections[remoteId] = conn;

    conn.on('open', () => {
      if (!this._isCurrentSession(session)) return;
      this.connections[remoteId] = conn;
    });

    conn.on('data', (data) => {
      if (!this._isCurrentSession(session) || !data || typeof data !== 'object') return;

      if (data.type === MsgType.JOIN_ROOM) {
        this.connections[remoteId] = conn;
        this._emit('onPlayerJoined', remoteId, data);
        return;
      }

      if (data.type === MsgType.PING) {
        this._safeSend(conn, { type: MsgType.PONG, seq: data.seq });
        return;
      }

      this._emit('onData', remoteId, data);
    });

    conn.on('close', () => {
      if (!this._isCurrentSession(session)) return;
      this._removeConnection(remoteId);
    });

    conn.on('error', (err) => {
      if (!this._isCurrentSession(session)) return;
      console.error(`Connection error with ${remoteId}:`, err);
      this._removeConnection(remoteId);
    });
  }

  joinRoom(roomCode, joinPayload) {
    const normalizedRoomCode = this._normalizeRoomCode(roomCode);
    if (normalizedRoomCode.length < 3) {
      this._emit('onError', 'Room code must be at least 3 characters.');
      return;
    }

    const session = this._beginSession(false, normalizedRoomCode);
    this.hostPeerId = this._prefixRoom(this.roomCode);

    try {
      this.peer = this._createPeer(null);
    } catch (err) {
      this._emit('onError', err.message);
      this.stop({ notifyGuests: false });
      return;
    }

    this._setTimer('init', session, () => {
      this._emit('onError', 'Timed out while preparing multiplayer. Check your connection and try again.');
      this.stop({ notifyGuests: false });
    }, INIT_TIMEOUT_MS);

    this.peer.on('open', (id) => {
      if (!this._isCurrentSession(session)) return;

      this._clearTimer('init');
      this.localId = id;

      const conn = this.peer.connect(this.hostPeerId, { reliable: true });
      this.connections[this.hostPeerId] = conn;
      this._setupClientConnection(conn, this.hostPeerId, joinPayload, session);
    });

    this.peer.on('disconnected', () => {
      if (!this._isCurrentSession(session)) return;
      console.warn('Peer client disconnected from the signaling server. Attempting silent reconnect...');
      this._schedulePeerReconnect(session);
    });

    this.peer.on('error', (err) => this._handlePeerError(err, 'client', session));
  }

  _setupClientConnection(conn, hostPeerId, joinPayload, session) {
    this._setTimer('connect', session, () => {
      this._emit('onError', `Timed out while connecting to room "${this.roomCode}".`);
      this.stop({ notifyGuests: false });
    }, CONNECT_TIMEOUT_MS);

    conn.on('open', () => {
      if (!this._isCurrentSession(session)) return;

      this._clearTimer('connect');
      this.hasConnectedToHost = true;
      this.connections[hostPeerId] = conn;
      this._safeSend(conn, joinPayload);
      this._emit('onConnected');

      this._setTimer('handshake', session, () => {
        this._emit('onError', 'The host did not accept the join request in time.');
        this.stop({ notifyGuests: false });
      }, HANDSHAKE_TIMEOUT_MS);

      this._startClientPing(hostPeerId, session);
    });

    conn.on('data', (data) => {
      if (!this._isCurrentSession(session) || !data || typeof data !== 'object') return;

      if (data.type === MsgType.PONG) {
        this._handlePong(data);
        return;
      }

      if (data.type === MsgType.ROOM_JOINED) {
        this.hasJoinedRoom = true;
        this._clearTimer('handshake');
      }

      this._emit('onData', hostPeerId, data);
    });

    conn.on('close', () => {
      if (!this._isCurrentSession(session)) return;
      this._handleHostDisconnected('Host closed the connection or went offline.');
    });

    conn.on('error', (err) => {
      if (!this._isCurrentSession(session)) return;
      if (!this.hasJoinedRoom) {
        console.warn('Host connection error:', err);
        this._emit('onError', `Failed to join room. ${this._formatPeerError(err, 'Could not connect to host.')}`);
        this.stop({ notifyGuests: false });
        return;
      }

      console.error('Host connection error:', err);
      this._handleHostDisconnected('Connection to the host failed.');
    });
  }

  _handlePong(data) {
    const sentAt = this.pendingPings.get(data.seq);
    if (!sentAt) return;

    this.pendingPings.delete(data.seq);
    this.lastPongAt = Date.now();
    this.latency = this.lastPongAt - sentAt;
  }

  _removeConnection(remoteId) {
    if (!this.connections[remoteId]) return;

    delete this.connections[remoteId];
    this._emit('onPlayerLeft', remoteId);
  }

  _handleHostDisconnected(reason) {
    if (this.hostDisconnectNotified) return;

    this.hostDisconnectNotified = true;
    this.stop({ notifyGuests: false });
    this._emit('onDisconnected', reason || 'Host closed the connection or went offline.');
  }

  _startClientPing(hostId, session) {
    if (this.isHost) return;

    this.lastPongAt = Date.now();
    this.pendingPings.clear();

    const runPing = () => {
      if (!this._isCurrentSession(session)) return;

      const conn = this.connections[hostId];
      const now = Date.now();

      if (!conn || !conn.open) {
        this._handleHostDisconnected('Connection to the host was lost.');
        return;
      }

      if (this.hasJoinedRoom && now - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this._handleHostDisconnected('Host heartbeat timed out.');
        return;
      }

      this.pingSequence++;
      this.pendingPings.set(this.pingSequence, now);
      this._safeSend(conn, { type: MsgType.PING, seq: this.pingSequence });

      for (const [seq, sentAt] of this.pendingPings) {
        if (now - sentAt > HEARTBEAT_TIMEOUT_MS) {
          this.pendingPings.delete(seq);
        }
      }

      this._setTimer('ping', session, runPing, PING_INTERVAL_MS);
    };

    this._setTimer('ping', session, runPing, PING_INTERVAL_MS);
  }

  broadcast(payload) {
    if (!this.isHost || this.stopped) return;

    Object.keys(this.connections).forEach(key => {
      this._safeSend(this.connections[key], payload);
    });
  }

  sendTo(targetId, payload) {
    return this._safeSend(this.connections[targetId], payload);
  }

  sendToHost(payload) {
    if (this.isHost || this.stopped) return false;

    const hostId = this.hostPeerId || this._prefixRoom(this.roomCode);
    return this._safeSend(this.connections[hostId], payload);
  }

  stop(options = {}) {
    const { notifyGuests = true } = options;
    const hadActiveSession = !this.stopped || this.peer || Object.keys(this.connections).length > 0;
    if (!hadActiveSession) return;

    const wasHost = this.isHost;
    const connections = { ...this.connections };

    if (wasHost && notifyGuests) {
      Object.keys(connections).forEach(key => {
        this._safeSend(connections[key], { type: MsgType.ERROR, message: 'Room host has shut down this lobby.' }, true);
      });
    }

    this.isStopping = true;
    this._clearTimers();
    this.pendingPings.clear();

    Object.keys(connections).forEach(key => {
      try {
        connections[key].close();
      } catch (err) {}
    });

    if (this.peer) {
      try {
        this.peer.disconnect();
        this.peer.destroy();
      } catch (err) {}
    }

    this.sessionId++;
    this._resetRuntimeState(true);
  }
}
