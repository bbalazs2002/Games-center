/**
 * Separate, lightweight file — DELIBERATELY not inside DamaOnlineGamePage.tsx,
 * because LobbyPage would then have to statically import it too, which would
 * pull the Dáma engine/UI code back into the main bundle (losing the
 * GameLoader/lazy() code-splitting benefit — see
 * docs/fazis-0b-multiplayer-specifikacio.md §6.2).
 */
export const NEW_ROOM_PARAM = 'new';
