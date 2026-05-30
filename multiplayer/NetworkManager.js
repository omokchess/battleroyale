/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MsgType } from './Protocol.js';

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomCode = '';
    this.localId = null;
    
    // Connections registry: key is player/peer ID, value is PeerJS connection object
    this.connections = {};
    
    // Event callbacks
    this.callbacks = {
      onInit: null,          // peer initialized
      onError: null,         // peer or link error
      onConnected: null,     // connected to room (client) or open (host)
      onPlayerJoined: null,   // host: raw join payload received
      onPlayerLeft: null,     // peer left
      onData: null,          // packet received
      onDisconnected: null   // disconnected from peer or server
    };

    // Ping measurement
    this.pingSequence = 0;
    this.pingSentTime = 0;
    this.latency = 0;
    this.pingTimeout = null;
  }

  // Bind callbacks
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
    }
  }

  /**
   * Helper to check if Peer is loaded
   */
  _getPeerClass() {
    if (window.Peer) return window.Peer;
    if (typeof Peer !== 'undefined') return Peer;
    throw new Error('PeerJS not loaded from cloud. Please check your network connection.');
  }

  /**
   * Room ID Prefixer (to avoid namespace collision on the public cloud server)
   */
  _prefixRoom(roomCode) {
    return `ais-br-bg-room-${roomCode.trim().toUpperCase()}`;
  }

  /**
   * Hosting a fresh game lobby
   */
  hostRoom(roomCode) {
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase();
    const targetPeerId = this._prefixRoom(this.roomCode);

    try {
      const PeerClass = this._getPeerClass();
      // Host uses targetPeerId specifically as their Peer ID
      this.peer = new PeerClass(targetPeerId, {
        debug: 1, // only errors and warnings in console
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });
    } catch (e) {
      if (this.callbacks.onError) this.callbacks.onError(e.message);
      return;
    }

    this.peer.on('open', (id) => {
      this.localId = id;
      if (this.callbacks.onInit) this.callbacks.onInit(this.roomCode);
    });

    this.peer.on('connection', (conn) => {
      // Connect callbacks for guest connects
      const remoteId = conn.peer;
      
      // Register immediately to prevent race conditions during early data packets!
      this.connections[remoteId] = conn;

      conn.on('open', () => {
        this.connections[remoteId] = conn;
      });

      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;

        // Host intercepts join room immediately before standard forward data
        if (data.type === MsgType.JOIN_ROOM) {
          if (this.callbacks.onPlayerJoined) {
            this.callbacks.onPlayerJoined(remoteId, data);
          }
        } else if (data.type === MsgType.PING) {
          conn.send({ type: MsgType.PONG, seq: data.seq });
        } else {
          if (this.callbacks.onData) {
            this.callbacks.onData(remoteId, data);
          }
        }
      });

      conn.on('close', () => {
        this._removeConnection(remoteId);
      });

      conn.on('error', (err) => {
        console.error(`Connection error with ${remoteId}:`, err);
        this._removeConnection(remoteId);
      });
    });

    this.peer.on('error', (err) => {
      console.error('Peer host level error:', err);
      let errMsg = 'Failed to create room. ';
      if (err.type === 'unavailable-id') {
        errMsg += `Room code "${this.roomCode}" is already taken by someone else!`;
      } else {
        errMsg += err.message || err.type;
      }
      if (this.callbacks.onError) this.callbacks.onError(errMsg);
    });
  }

  /**
   * Entering an active game lobby
   */
  joinRoom(roomCode, joinPayload) {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    const hostPeerId = this._prefixRoom(this.roomCode);

    try {
      const PeerClass = this._getPeerClass();
      // Client gets a random, unique auto-generated ID
      this.peer = new PeerClass(null, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });
    } catch (e) {
      if (this.callbacks.onError) this.callbacks.onError(e.message);
      return;
    }

    this.peer.on('open', (id) => {
      this.localId = id;
      
      // Connect specifically to host
      const conn = this.peer.connect(hostPeerId, {
        reliable: true
      });

      // Register immediately to prevent race conditions during initialization
      this.connections[hostPeerId] = conn;

      conn.on('open', () => {
        this.connections[hostPeerId] = conn;
        // Send initial validation frame
        conn.send(joinPayload);
        
        if (this.callbacks.onConnected) {
          this.callbacks.onConnected();
        }

        // Engage recursive ping check loop
        this._startClientPing(hostPeerId);
      });

      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;

        if (data.type === MsgType.PONG) {
          if (data.seq === this.pingSequence) {
            this.latency = Date.now() - this.pingSentTime;
          }
        } else {
          if (this.callbacks.onData) {
            this.callbacks.onData(hostPeerId, data);
          }
        }
      });

      conn.on('close', () => {
        console.warn('Disconnected from host connection.');
        this._handleHostDisconnected();
      });

      conn.on('error', (err) => {
        console.error('Host connection error:', err);
        this._handleHostDisconnected();
      });
    });

    this.peer.on('error', (err) => {
      console.error('Peer client level error:', err);
      let errMsg = 'Failed to join room. ';
      if (err.type === 'peer-not-found') {
        errMsg += `Room code "${this.roomCode}" does not exist. Make sure you entered it correctly!`;
      } else {
        errMsg += err.message || err.type;
      }
      if (this.callbacks.onError) this.callbacks.onError(errMsg);
    });
  }

  /**
   * Host actions to clear and notify guest drops
   */
  _removeConnection(remoteId) {
    if (this.connections[remoteId]) {
      delete this.connections[remoteId];
    }
    if (this.callbacks.onPlayerLeft) {
      this.callbacks.onPlayerLeft(remoteId);
    }
  }

  /**
   * Guest action when Host vanishes or kills socket
   */
  _handleHostDisconnected() {
    this.stop();
    if (this.callbacks.onDisconnected) {
      this.callbacks.onDisconnected('Host closed connection or went offline.');
    }
  }

  /**
   * Guest ping checking routine
   */
  _startClientPing(hostId) {
    if (!this.peer || this.peer.destroyed || this.isHost) return;

    const runPing = () => {
      const conn = this.connections[hostId];
      if (conn && conn.open) {
        this.pingSequence++;
        this.pingSentTime = Date.now();
        conn.send({ type: MsgType.PING, seq: this.pingSequence });
      }
      this.pingTimeout = setTimeout(runPing, 2000);
    };

    this.pingTimeout = setTimeout(runPing, 2000);
  }

  /**
   * Broadcast message to everyone (Host)
   */
  broadcast(payload) {
    if (!this.isHost) return;
    for (const key in this.connections) {
      const conn = this.connections[key];
      if (conn) {
        if (conn.open) {
          conn.send(payload);
        } else {
          try {
            conn.send(payload);
          } catch (e) {}
        }
      }
    }
  }

  /**
   * Unicast message to a specific connection
   */
  sendTo(targetId, payload) {
    const conn = this.connections[targetId];
    if (conn) {
      if (conn.open) {
        conn.send(payload);
      } else {
        try {
          conn.send(payload);
        } catch (e) {}
      }
    }
  }

  /**
   * Send data directly to the host (Guest Client)
   */
  sendToHost(payload) {
    if (this.isHost) return;
    const hostId = this._prefixRoom(this.roomCode);
    const conn = this.connections[hostId];
    if (conn) {
      if (conn.open) {
        conn.send(payload);
      } else {
        try {
          conn.send(payload);
        } catch (e) {}
      }
    }
  }

  /**
   * Teardown entire connection pipeline cleanly
   */
  stop() {
    clearTimeout(this.pingTimeout);
    
    // Send farewell
    if (this.isHost) {
      this.broadcast({ type: MsgType.ERROR, message: 'Room host has shut down this lobby.' });
    }

    for (const key in this.connections) {
      try {
        this.connections[key].close();
      } catch (e) {}
    }
    this.connections = {};

    if (this.peer) {
      try {
        this.peer.disconnect();
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    
    this.isHost = false;
    this.roomCode = '';
    this.localId = null;
    this.latency = 0;
  }
}
