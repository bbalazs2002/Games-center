/**
 * Room-listing metadata shown in the lobby. Deliberately excludes the
 * password itself — only whether one is required — since this is broadcast
 * to every client browsing the lobby list. Shared between server
 * (GameRoom.setMetadata) and client (LobbyPage room-list typing).
 */
export interface RoomMetadata {
  hasPassword?: boolean;
}
