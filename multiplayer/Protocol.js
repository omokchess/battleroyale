/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// game packet type labels
export const MsgType = {
  HOST_CREATE_ROOM: 'HOST_CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  ROOM_JOINED: 'ROOM_JOINED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  PLAYER_INPUT: 'PLAYER_INPUT',
  PLAYER_AIM: 'PLAYER_AIM',
  PLAYER_ACTION: 'PLAYER_ACTION',
  WEAPON_SELECT: 'WEAPON_SELECT',
  GAME_STATE: 'GAME_STATE',
  PING: 'PING',
  PONG: 'PONG',
  ERROR: 'ERROR'
};

/**
 * Clean serialization wrappers
 */
export const Protocol = {
  // Client registration frame. `costume` (optional) carries the purchased
  // skin colors { color, accentColor } so the host paints this player for everyone.
  joinRoom(nickname, weapon, costume = null) {
    return { type: MsgType.JOIN_ROOM, nickname, weapon, costume };
  },

  // Handshake registration acceptance frame
  roomJoined(id, initialPlayers, mapWidth, mapHeight) {
    return { type: MsgType.ROOM_JOINED, id, initialPlayers, mapWidth, mapHeight };
  },

  // Notify clients of a newcomer
  playerJoined(player) {
    return { type: MsgType.PLAYER_JOINED, player };
  },

  // Broadcast coordinate input maps from client to host
  clientInput(keys) {
    return { type: MsgType.PLAYER_INPUT, keys };
  },

  // Broadcast pointer aim angle
  clientAim(angle) {
    return { type: MsgType.PLAYER_AIM, angle };
  },

  // Discrete one-shot commands (dash / skill). Dash carries the intended
  // movement direction so the host reproduces the client's burst direction.
  clientAction(action, dx = 0, dy = 0, extra = null) {
    const msg = { type: MsgType.PLAYER_ACTION, action };
    if (action === 'dash') {
      msg.dx = dx;
      msg.dy = dy;
    }
    if (extra && typeof extra === 'object') {
      Object.assign(msg, extra);
    }
    return msg;
  },

  // Request a weapon swap (applied on the next respawn).
  selectWeapon(weapon) {
    return { type: MsgType.WEAPON_SELECT, weapon };
  },

  // System snapshot state
  gameState(players, projectiles, effects, remainingPlayersCount) {
    return { 
      type: MsgType.GAME_STATE, 
      players, 
      projectiles, 
      effects, 
      remainingPlayersCount,
      timestamp: Date.now() 
    };
  },

  // Ping frames
  ping(seq) {
    return { type: MsgType.PING, seq };
  },

  pong(seq) {
    return { type: MsgType.PONG, seq };
  }
};
