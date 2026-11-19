import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RoomQrCode } from "./RoomQrCode";
import messages from "../../messages/en.json";

vi.mock("qrcode.react", () => ({ QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr" data-value={value} /> }));

it("generates the current room link only when requested, without URL secrets", () => {
  const show = vi.fn();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: show });
  window.history.replaceState({}, "", "/room/old?token=private#private");
  render(<NextIntlClientProvider locale="en" messages={messages}><RoomQrCode roomId="friends-room" /></NextIntlClientProvider>);
  expect(screen.queryByTestId("qr")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show room QR code" }));
  expect(show).toHaveBeenCalledOnce();
  expect(screen.getByTestId("qr")).toHaveAttribute("data-value", `${window.location.origin}/room/friends-room`);
  window.history.replaceState({}, "", "/");
});

 it("uses the hosted origin automatically and hides the localhost notice", () => {
  const show = vi.fn();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: show });
  vi.stubGlobal("location", new URL("https://holo.ufraan.dev/room/friends-room?token=private#private"));
  try {
    render(<NextIntlClientProvider locale="en" messages={messages}><RoomQrCode roomId="friends-room" /></NextIntlClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Show room QR code" }));
    expect(screen.getByTestId("qr")).toHaveAttribute("data-value", "https://holo.ufraan.dev/room/friends-room");
    expect(screen.queryByText(messages.RoomHeader.qrLocalNotice)).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
