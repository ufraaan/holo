import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import TransferList from "./TransferList";
import type { ChatMessage } from "./room-utils";
import messages from "../../messages/en.json";

function room(chatMessages: ChatMessage[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TransferList
        transfers={{}} textShares={{}} chatMessages={chatMessages}
        onSendChatMessage={vi.fn()} status="connected"
        currentSenderId="me" currentSenderName="Aki"
      />
    </NextIntlClientProvider>
  );
}

function message(id: string, senderId = "other"): ChatMessage {
  return { id, senderId, senderName: "Ken", text: id, timestamp: Date.now() };
}

function visibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

beforeEach(() => {
  document.title = "Holo room";
  visibility("visible");
});

afterEach(() => {
  visibility("visible");
});

it("counts incoming messages, shows a dot, and clears on opening Chat", () => {
  const { rerender } = render(room([]));
  rerender(room([message("own", "me")]));
  expect(document.title).toBe("Holo room");
  rerender(room([message("own", "me"), message("one")]));
  expect(document.title).toBe("1 unread message · Holo");
  const chat = screen.getByRole("button", { name: "Chat, 1 unread message" });
  expect(chat.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  rerender(room([message("own", "me"), message("one"), message("two")]));
  expect(document.title).toBe("2 unread messages · Holo");
  fireEvent.click(screen.getByRole("button", { name: "Chat, 2 unread messages" }));
  expect(document.title).toBe("Holo room");
  expect(screen.getByRole("button", { name: "Chat" }).querySelector('[aria-hidden="true"]')).toBeNull();
});

it("counts background messages with Chat open and clears on return", () => {
  const { rerender } = render(room([]));
  fireEvent.click(screen.getByRole("button", { name: "Chat" }));
  rerender(room([message("visible")]));
  expect(document.title).toBe("Holo room");
  visibility("hidden");
  rerender(room([message("visible"), message("hidden")]));
  expect(document.title).toBe("1 unread message · Holo");
  visibility("visible");
  expect(document.title).toBe("Holo room");
  fireEvent.click(screen.getByRole("button", { name: "Transfers" }));
  rerender(room([message("visible"), message("hidden"), message("new")]));
  expect(document.title).toBe("1 unread message · Holo");
});

it("keeps messages unread on return to Transfers and restores the title on unmount", () => {
  const { rerender, unmount } = render(room([]));
  visibility("hidden");
  rerender(room([message("one")]));
  visibility("visible");
  expect(document.title).toBe("1 unread message · Holo");
  unmount();
  expect(document.title).toBe("Holo room");
});
