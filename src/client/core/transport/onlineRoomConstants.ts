/**
 * Separate, lightweight file — DELIBERATELY not inside a game-specific
 * *OnlineGamePage.tsx, because LobbyPage would then have to statically
 * import it too, which would pull that game's engine/UI code back into the
 * main bundle (losing the GameLoader/lazy() code-splitting benefit — see
 * docs/dama-0b-multiplayer-specifikacio.md §6.2). Game-agnostic, lives in
 * client/core alongside the rest of the transport layer.
 */
export const NEW_ROOM_PARAM = 'new';
