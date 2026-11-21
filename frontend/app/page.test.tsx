import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import HomePage from "./(main)/page";
import messages from "../messages/en.json";
import type { ReactNode } from "react";

function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/",
}));

describe("HomePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("focuses the room id with slash without inserting the shortcut character", () => {
    render(<HomePage />, { wrapper: I18nProvider });
    const input = screen.getByRole("textbox", { name: "Enter room ID" });

    expect(input).not.toHaveFocus();
    expect(fireEvent.keyDown(document.body, { key: "/" })).toBe(false);

    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { repeat: true },
    { key: "?" },
  ])("ignores modified, composing, repeated or unrelated keys: %j", (options) => {
    render(<HomePage />, { wrapper: I18nProvider });

    expect(fireEvent.keyDown(document.body, { key: "/", ...options })).toBe(true);

    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("preserves normal typing in the room id field", () => {
    render(<HomePage />, { wrapper: I18nProvider });
    const input = screen.getByRole("textbox");
    input.focus();

    expect(fireEvent.keyDown(input, { key: "/" })).toBe(true);

    expect(input).toHaveFocus();
  });

  it.each(["input", "textarea", "select", "contenteditable", "dialog"])(
    "does not steal focus from %s",
    (kind) => {
      render(
        <>
          <HomePage />
          {kind === "contenteditable" ? (
            <div contentEditable suppressContentEditableWarning tabIndex={0} data-testid="other-control"><span>Editing</span></div>
          ) : kind === "dialog" ? (
            <dialog open><button data-testid="other-control">Close</button></dialog>
          ) : kind === "textarea" ? (
            <textarea data-testid="other-control" />
          ) : kind === "select" ? (
            <select data-testid="other-control"><option>English</option></select>
          ) : (
            <input data-testid="other-control" />
          )}
        </>,
        { wrapper: I18nProvider },
      );
      const otherControl = screen.getByTestId("other-control");
      otherControl.focus();

      expect(fireEvent.keyDown(otherControl.firstElementChild ?? otherControl, { key: "/" })).toBe(true);

      expect(otherControl).toHaveFocus();
    },
  );

  it("respects an already handled key event", () => {
    render(<HomePage />, { wrapper: I18nProvider });
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    event.preventDefault();

    fireEvent(document.body, event);

    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("removes the shortcut when leaving the home page", () => {
    const { unmount } = render(<HomePage />, { wrapper: I18nProvider });
    unmount();

    expect(fireEvent.keyDown(document.body, { key: "/" })).toBe(true);
  });

  it("joins a room using entered room id", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(pushMock).toHaveBeenCalledWith("/room/abc123");
  });

  it("joins a room using lowercase version of entered room id", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "AbC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(pushMock).toHaveBeenCalledWith("/room/abc123");
  });

  it("does not join when room id is blank", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows error for profane room name", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "fuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(
      screen.getByText("Room name contains inappropriate language."),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows error for profane room name with mixed case", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "FuCk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(
      screen.getByText("Room name contains inappropriate language."),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("clears error on valid submission", () => {
    render(<HomePage />, { wrapper: I18nProvider });

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "fuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(
      screen.getByText("Room name contains inappropriate language."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(
      screen.queryByText("Room name contains inappropriate language."),
    ).not.toBeInTheDocument();
    expect(pushMock).toHaveBeenCalledWith("/room/abc123");
  });
});
