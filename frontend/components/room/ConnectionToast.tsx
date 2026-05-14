import { type ConnectionToast as Toast } from "./useRoomWebSocket";

interface ConnectionToastProps {
  toasts: Toast[];
}

export default function ConnectionToast({ toasts }: ConnectionToastProps) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9998] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-[fadeInUp_0.3s_ease-out] flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white shadow-lg shadow-black/20 backdrop-blur-md"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs">
            {t.message.includes("joined") ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-emerald-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-rose-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="11" x2="17" y2="16" /><line x1="14.5" y1="13.5" x2="19.5" y2="13.5" /></svg>
            )}
          </span>
          <span className="text-white/90">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
