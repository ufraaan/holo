import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ConnectionToast from "./ConnectionToast";
import FileDropZone from "./FileDropZone";
import RoomHeader from "./RoomHeader";
import TextInputArea from "./TextInputArea";
import TransferList from "./TransferList";
import type { ReactNode } from "react";
import messages from "../../messages/en.json";

function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

describe("ConnectionToast", () => {
  it("renders nothing when toasts is empty", () => {
    const { container } = render(
      <I18nProvider>
        <ConnectionToast toasts={[]} />
      </I18nProvider>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders join toast", () => {
    render(
      <I18nProvider>
        <ConnectionToast toasts={[{ id: "1", type: "joined" }]} />
      </I18nProvider>,
    );
    expect(screen.getByText("someone joined the room")).toBeInTheDocument();
  });

  it("renders leave toast", () => {
    render(
      <I18nProvider>
        <ConnectionToast toasts={[{ id: "2", type: "left" }]} />
      </I18nProvider>,
    );
    expect(screen.getByText("someone left the room")).toBeInTheDocument();
  });
});

describe("FileDropZone", () => {
  const noop = () => {};
  const handlers = {
    onInputChange: noop,
    onDrop: noop,
    onDragOver: noop,
  };

  it("shows connecting banner", () => {
    render(
      <I18nProvider>
        <FileDropZone status="connecting" errorMessage={null} {...handlers} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Connecting to relay/)).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(
      <I18nProvider>
        <FileDropZone
          status="closed"
          errorMessage="connection refused"
          {...handlers}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("connection refused")).toBeInTheDocument();
  });

  it("enables file input when connected", () => {
    render(
      <I18nProvider>
        <FileDropZone status="connected" errorMessage={null} {...handlers} />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Choose file");
    expect(input).not.toBeDisabled();
  });

  it("disables file input when not connected", () => {
    render(
      <I18nProvider>
        <FileDropZone status="connecting" errorMessage={null} {...handlers} />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Choose file");
    expect(input).toBeDisabled();
  });

  it("calls onInputChange when file selected", () => {
    const onInputChange = vi.fn();
    render(
      <I18nProvider>
        <FileDropZone
          status="connected"
          errorMessage={null}
          onInputChange={onInputChange}
          onDrop={noop}
          onDragOver={noop}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByLabelText("Choose file"));
    expect(onInputChange).toHaveBeenCalledOnce();
  });
});

describe("RoomHeader", () => {
  it("displays room id", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="abc-123" status="connected" clientCount={0} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });

  it("shows connected status", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="r1" status="connected" clientCount={2} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("2 connected")).toBeInTheDocument();
  });

  it("shows connecting status", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="r1" status="connecting" clientCount={0} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText("Connecting\u2026")).toBeInTheDocument();
  });

  it("shows retry button when closed", () => {
    const onRetry = vi.fn();
    render(
      <I18nProvider>
        <RoomHeader roomId="r1" status="closed" clientCount={0} onRetry={onRetry} />
      </I18nProvider>,
    );
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows fullscreen room code on expand click", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="xyz" status="connected" clientCount={0} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle("show room code fullscreen"));
    expect(screen.getByText("Room code")).toBeInTheDocument();
    expect(screen.getAllByText("xyz").length).toBe(2);
  });

  it("closes fullscreen on overlay click", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="xyz" status="connected" clientCount={0} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle("show room code fullscreen"));
    expect(screen.getByText("Room code")).toBeInTheDocument();

    const overlays = screen.getAllByText("xyz");
    fireEvent.click(overlays[1]);
    expect(screen.queryByText("Room code")).not.toBeInTheDocument();
  });

  it("closes fullscreen on escape", () => {
    render(
      <I18nProvider>
        <RoomHeader roomId="xyz" status="connected" clientCount={0} onRetry={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle("show room code fullscreen"));
    expect(screen.getByText("Room code")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Room code")).not.toBeInTheDocument();
  });
});

describe("TextInputArea", () => {
  const nameRef = { current: null };
  const textRef = { current: null };

  it("renders inputs and send button", () => {
    render(
      <I18nProvider>
        <TextInputArea
          status="connected"
          onSend={vi.fn()}
          onKeyDown={vi.fn()}
          textNameInputRef={nameRef}
          textInputRef={textRef}
        />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText("Filename (optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste or type text to share\u2026")).toBeInTheDocument();
    expect(screen.getByText("Share text")).toBeInTheDocument();
  });

  it("enables inputs when connected", () => {
    render(
      <I18nProvider>
        <TextInputArea
          status="connected"
          onSend={vi.fn()}
          onKeyDown={vi.fn()}
          textNameInputRef={nameRef}
          textInputRef={textRef}
        />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText("Filename (optional)")).not.toBeDisabled();
    expect(screen.getByPlaceholderText("Paste or type text to share\u2026")).not.toBeDisabled();
    expect(screen.getByText("Share text")).not.toBeDisabled();
  });

  it("disables inputs when not connected", () => {
    render(
      <I18nProvider>
        <TextInputArea
          status="connecting"
          onSend={vi.fn()}
          onKeyDown={vi.fn()}
          textNameInputRef={nameRef}
          textInputRef={textRef}
        />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText("Filename (optional)")).toBeDisabled();
    expect(screen.getByPlaceholderText("Paste or type text to share\u2026")).toBeDisabled();
    expect(screen.getByText("Share text")).toBeDisabled();
  });

  it("calls onSend on button click", () => {
    const onSend = vi.fn();
    render(
      <I18nProvider>
        <TextInputArea
          status="connected"
          onSend={onSend}
          onKeyDown={vi.fn()}
          textNameInputRef={nameRef}
          textInputRef={textRef}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText("Share text"));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("calls onKeyDown on textarea keydown", () => {
    const onKeyDown = vi.fn();
    render(
      <I18nProvider>
        <TextInputArea
          status="connected"
          onSend={vi.fn()}
          onKeyDown={onKeyDown}
          textNameInputRef={nameRef}
          textInputRef={textRef}
        />
      </I18nProvider>,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("Paste or type text to share\u2026"), {
      key: "Enter",
    });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});

describe("TransferList", () => {
  it("shows empty state", () => {
    render(
      <I18nProvider>
        <TransferList transfers={{}} textShares={{}} />
      </I18nProvider>,
    );
    expect(screen.getByText("No transfers yet.")).toBeInTheDocument();
  });

  it("renders text shares sorted by newest first", () => {
    render(
      <I18nProvider>
        <TransferList
          transfers={{}}
          textShares={{
            t1: { id: "t1", text: "older", timestamp: 100, direction: "incoming" },
            t2: { id: "t2", text: "newer", timestamp: 200, direction: "incoming" },
          }}
        />
      </I18nProvider>,
    );
    const items = screen.getAllByText(/older|newer/);
    expect(items[0]).toHaveTextContent("newer");
    expect(items[1]).toHaveTextContent("older");
  });

  it("renders incoming text share details", () => {
    render(
      <I18nProvider>
        <TransferList
          transfers={{}}
          textShares={{
            t1: { id: "t1", text: "hello world", timestamp: 1000, direction: "incoming" },
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.getByText(/11 chars/)).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Received"))).toBeInTheDocument();
  });

  it("renders outgoing text share details", () => {
    render(
      <I18nProvider>
        <TransferList
          transfers={{}}
          textShares={{
            t1: { id: "t1", text: "sent text", timestamp: 1000, direction: "outgoing" },
          }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText((c) => c.includes("Sent"))).toBeInTheDocument();
  });

  it("renders transfers sorted by name", () => {
    render(
      <I18nProvider>
        <TransferList
          transfers={{
            b: { id: "b", name: "beta.txt", size: 200, mime: "text/plain", progress: 50, direction: "outgoing" },
            a: { id: "a", name: "alpha.txt", size: 100, mime: "text/plain", progress: 100, direction: "outgoing" },
          }}
          textShares={{}}
        />
      </I18nProvider>,
    );
    const names = screen.getAllByText(/\.txt$/);
    expect(names[0]).toHaveTextContent("alpha.txt");
    expect(names[1]).toHaveTextContent("beta.txt");
  });

  it("shows download link for completed transfer", () => {
    render(
      <I18nProvider>
        <TransferList
          transfers={{
            f1: { id: "f1", name: "doc.pdf", size: 500, mime: "application/pdf", progress: 100, url: "blob:abc", direction: "incoming" },
          }}
          textShares={{}}
        />
      </I18nProvider>,
    );
    const link = screen.getByText("Save");
    expect(link.closest("a")).toHaveAttribute("download", "doc.pdf");
  });
});
