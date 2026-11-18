// Kept in sync with frontend/components/room/room-utils.ts so a client shows
// the same display name for itself that the relay assigns to its messages.
const CHAT_NAMES = [
  "Aki", "Ken", "Yuki", "Ryo", "Mai", "Jun", "Sho", "Taro", "Rei", "Miki",
  "Riku", "Hina", "Momo", "Sora", "Kaito", "Haru", "Nao", "Yuto", "Rin", "Aoi",
  "Ren", "Eri", "Taku", "Risa", "Mari",
];

export function getChatName(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  }
  return CHAT_NAMES[Math.abs(hash) % CHAT_NAMES.length] ?? "Holo";
}
