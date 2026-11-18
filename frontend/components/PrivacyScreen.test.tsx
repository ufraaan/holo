import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { PrivacyScreen } from "./PrivacyScreen";
import messages from "../messages/en.json";

// jsdom does not implement modal dialog methods.
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); }),
  });
});

afterEach(() => {
  cleanup();
  for (const [name, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function page() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <textarea aria-label="Draft" defaultValue="keep this draft" />
      <PrivacyScreen />
    </NextIntlClientProvider>
  );
}

function typeKeys(keys: string, target: Window | HTMLElement = window) {
  for (const key of keys) fireEvent.keyDown(target, { key });
}

it("toggles a modal blackout from a focused text field without losing page state", () => {
  const { container, rerender } = render(page());
  const draft = screen.getByRole("textbox", { name: "Draft" });
  const dialog = container.querySelector("dialog")!;
  draft.focus();
  typeKeys("qwe", draft);
  expect(dialog).toHaveAttribute("open");
  expect(dialog.showModal).toHaveBeenCalledOnce();
  // A root-layout rerender must leave the blackout in place.
  rerender(page());
  expect(dialog).toHaveAttribute("open");
  typeKeys("qwe");
  expect(dialog).not.toHaveAttribute("open");
  expect(draft).toHaveValue("keep this draft");
});

it("rejects slow, interrupted, modified, composing, and repeated keystrokes", () => {
  vi.useFakeTimers();
  const { container } = render(page());
  const dialog = container.querySelector("dialog")!;
  typeKeys("q");
  vi.advanceTimersByTime(1001);
  typeKeys("we");
  typeKeys("qwxe");
  fireEvent.keyDown(window, { key: "q", ctrlKey: true });
  typeKeys("we");
  fireEvent.keyDown(window, { key: "q", isComposing: true });
  typeKeys("we");
  fireEvent.keyDown(window, { key: "q", repeat: true });
  typeKeys("we");
  expect(dialog).not.toHaveAttribute("open");
  typeKeys("QWE");
  expect(dialog).toHaveAttribute("open");
});

it("blocks page key handlers while black and does not reveal on Escape or cancel", () => {
  const { container } = render(page());
  typeKeys("qwe");
  const dialog = container.querySelector("dialog")!;
  const handler = vi.fn();
  document.addEventListener("keydown", handler);
  expect(fireEvent.keyDown(window, { key: "Escape" })).toBe(false);
  expect(fireEvent.keyDown(document, { key: "Enter" })).toBe(false);
  expect(fireEvent(dialog, new Event("cancel", { cancelable: true }))).toBe(false);
  expect(handler).not.toHaveBeenCalled();
  expect(dialog).toHaveAttribute("open");
  document.removeEventListener("keydown", handler);
  typeKeys("qwe");
  expect(dialog).not.toHaveAttribute("open");
});

it("cleans up the global shortcut on unmount", () => {
  const { unmount } = render(page());
  const open = vi.mocked(HTMLDialogElement.prototype.showModal);
  unmount();
  typeKeys("qwe");
  expect(open).not.toHaveBeenCalled();
});
