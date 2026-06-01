/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cross-device room presence for the KKuTu-style lobby browser.
 *
 * The game itself is pure PeerJS P2P with no backend, so there is nothing that
 * naturally knows which rooms exist. This module advertises/discovers rooms over
 * a public MQTT-over-WebSocket broker (no server for you to run) and falls back
 * to localStorage so same-browser multi-tab testing keeps working offline.
 *
 * To self-host discovery later, just point BROKER_URL at your own broker
 * (EMQX/Mosquitto/HiveMQ) — nothing else has to change.
 */

const NS = 'omokchess-pixelshowdown/v1';
const ROOM_TOPIC = `${NS}/rooms`;
const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const LS_KEY = 'pixelshowdown_rooms';
const STALE_MS = 12000;     // a room unheard-from for this long is dropped
const HEARTBEAT_MS = 3000;  // host re-advertises (and refreshes player count)

export class RoomRegistry {
  constructor() {
    this.instanceId = Math.random().toString(36).slice(2, 10);
    this.client = null;
    this.connected = false;
    this.remoteRooms = new Map(); // roomId -> info (+ _seen local receipt time)
    this.browsing = false;
    this.onUpdate = null;
    this.hosting = null; // { roomId, infoProvider } while hosting

    this._heartbeatTimer = null;
    this._pruneTimer = null;
    this._storageHandler = null;
    this._bc = null;

    this._connect();
  }

  get online() {
    return Boolean(this.client && this.connected);
  }

  _roomId(code) {
    return String(code || '').trim().toUpperCase();
  }

  _connect() {
    const mqtt = typeof window !== 'undefined' ? window.mqtt : null;
    if (!mqtt) return; // CDN missing → localStorage-only mode

    try {
      this.client = mqtt.connect(BROKER_URL, {
        clientId: `psd-${this.instanceId}`,
        keepalive: 30,
        reconnectPeriod: 4000,
        connectTimeout: 8000,
        clean: true
      });

      this.client.on('connect', () => {
        this.connected = true;
        if (this.browsing) this.client.subscribe(`${ROOM_TOPIC}/+`);
        if (this.hosting) this._publishPresence();
        this._emit();
      });
      this.client.on('message', (topic, payload) => this._onMessage(topic, payload));
      this.client.on('error', () => {});
      this.client.on('close', () => { this.connected = false; });
      this.client.on('offline', () => { this.connected = false; });
    } catch (err) {
      console.warn('Room registry broker unavailable, using local-only discovery.', err);
      this.client = null;
    }
  }

  _onMessage(topic, payload) {
    if (!topic.startsWith(`${ROOM_TOPIC}/`)) return;
    const roomId = topic.slice(ROOM_TOPIC.length + 1);
    const text = payload && payload.toString ? payload.toString() : '';

    if (!text) {
      // Empty retained payload = room closed.
      this.remoteRooms.delete(roomId);
      this._emit();
      return;
    }

    try {
      const info = JSON.parse(text);
      if (info && info.code) {
        info._seen = Date.now();

        // MQTT retain delivers the last message to every new subscriber
        // instantly — so _seen is always "now" even for dead hosts. Filter by
        // the publisher's ts instead; the heartbeat keeps it fresh while alive.
        if (Date.now() - (info.ts || 0) > STALE_MS) {
          // Auto-clean the stale retained message from the broker so future
          // subscribers don't see it either.
          if (this.online) {
            this.client.publish(`${ROOM_TOPIC}/${roomId}`, '', { retain: true, qos: 0 });
          }
          this.remoteRooms.delete(roomId);
          return;
        }

        this.remoteRooms.set(roomId, info);
        this._emit();
      }
    } catch {
      /* ignore foreign payloads on the shared broker */
    }
  }

  // ---------------------------------------------------------------- hosting --
  startHosting(code, infoProvider) {
    this.hosting = { roomId: this._roomId(code), infoProvider };
    this._publishPresence();
    this._writeLocal();
    this._heartbeatTimer = setInterval(() => {
      this._publishPresence();
      this._writeLocal();
    }, HEARTBEAT_MS);
  }

  _currentInfo() {
    if (!this.hosting) return null;
    const extra = (this.hosting.infoProvider && this.hosting.infoProvider()) || {};
    return {
      code: this.hosting.roomId,
      host: extra.host || this.hosting.roomId,
      weapon: extra.weapon || 'sword',
      players: extra.players || 1,
      ts: Date.now(),
      origin: this.instanceId
    };
  }

  _publishPresence() {
    if (!this.online || !this.hosting) return;
    const info = this._currentInfo();
    this.client.publish(`${ROOM_TOPIC}/${this.hosting.roomId}`, JSON.stringify(info), { retain: true, qos: 0 });
  }

  stopHosting() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this.hosting) {
      const roomId = this.hosting.roomId;
      if (this.online) {
        // Clear the retained presence so the room vanishes from other devices.
        this.client.publish(`${ROOM_TOPIC}/${roomId}`, '', { retain: true, qos: 0 });
      }
      this._removeLocal(roomId);
      this.hosting = null;
    }
  }

  // --------------------------------------------------------------- browsing --
  startBrowsing(onUpdate) {
    this.browsing = true;
    this.onUpdate = onUpdate;
    if (this.online) this.client.subscribe(`${ROOM_TOPIC}/+`);

    this._storageHandler = (e) => { if (e.key === LS_KEY) this._emit(); };
    if (typeof window !== 'undefined') window.addEventListener('storage', this._storageHandler);

    try {
      this._bc = new BroadcastChannel('pixelshowdown_rooms');
      this._bc.onmessage = () => this._emit();
    } catch {
      this._bc = null;
    }

    // Periodic tick prunes rooms whose host went silent.
    this._pruneTimer = setInterval(() => this._emit(), 2500);
    this._emit();
  }

  stopBrowsing() {
    this.browsing = false;
    this.onUpdate = null;
    if (this.online) this.client.unsubscribe(`${ROOM_TOPIC}/+`);
    if (this._storageHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', this._storageHandler);
      this._storageHandler = null;
    }
    if (this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }
    if (this._bc) {
      try { this._bc.close(); } catch {}
      this._bc = null;
    }
  }

  list() {
    const now = Date.now();
    const map = new Map();

    for (const [id, info] of this.remoteRooms) {
      // Use publisher's ts (not local _seen) so retained messages from dead
      // hosts are filtered even on first subscribe.
      if (now - (info.ts || 0) <= STALE_MS) map.set(id, info);
    }
    for (const info of this._readLocal()) {
      if (now - (info.ts || 0) <= STALE_MS) {
        const id = this._roomId(info.code);
        if (!map.has(id)) map.set(id, { ...info, _seen: info.ts });
      }
    }
    if (this.hosting) map.delete(this.hosting.roomId);

    return [...map.values()].sort((a, b) => (b._seen || 0) - (a._seen || 0));
  }

  _emit() {
    if (this.onUpdate) this.onUpdate(this.list());
  }

  // ----------------------------------------------------------- localStorage --
  _readLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return Object.values(obj);
    } catch {
      return [];
    }
  }

  _writeLocal() {
    const info = this._currentInfo();
    if (!info) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj[info.code] = info;
      const now = Date.now();
      Object.keys(obj).forEach(k => {
        if (now - (obj[k].ts || 0) > STALE_MS) delete obj[k];
      });
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
      if (this._bc) this._bc.postMessage('update');
    } catch {}
  }

  _removeLocal(roomId) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      delete obj[roomId];
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
      if (this._bc) this._bc.postMessage('update');
    } catch {}
  }

  destroy() {
    this.stopHosting();
    this.stopBrowsing();
    if (this.client) {
      try { this.client.end(true); } catch {}
      this.client = null;
    }
  }
}
