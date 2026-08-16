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
