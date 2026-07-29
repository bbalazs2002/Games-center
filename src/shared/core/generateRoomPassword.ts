/**
 * Generated client-side (not on the server) so the room creator sees the
 * password immediately in the create-room form, before the room even exists
 * — see docs/dama-0c-ai-specifikacio.md §3.3.
 */
export function generateRoomPassword(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase(); // e.g. "K3F9QX"
}
