import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../../messages/en.json";
import FileDropZone from "./FileDropZone";
import TransferList from "./TransferList";

function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

const noop = () => {};
const handlers = { onInputChange: noop, onDrop: noop, onDragOver: noop };

const baseTransferListProps = {
  textShares: {},
  chatMessages: [],
  onSendChatMessage: vi.fn(),
  status: "connected" as const,
  currentSenderId: "me",
  currentSenderName: "Aki",
  p2pEnabled: true,
};

function p2pTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: "in:peer-1:f1",
    name: "movie.mp4",
    size: 2000,
    mime: "video/mp4",
    progress: 40,
    direction: "incoming" as const,
    peerId: "peer-1",
    peerName: "Ken",
    connectionType: "direct" as const,
    status: "transferring" as const,
    bytesTransferred: 800,
    ...overrides,
  };
}

describe("FileDropZone P2P", () => {
  it("explains the send cap and the memory receiving cap separately", () => {
    render(
      <I18nProvider>
        <FileDropZone
          status="connected"
          errorMessage={null}
          {...handlers}
          p2pEnabled
          canReceiveToDisk={false}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/up to 3 GB per file/i)).toBeInTheDocument();
    expect(screen.getByText(/100 MB/i)).toBeInTheDocument();
  });

  it("announces the disk receiving cap when the browser supports it", () => {
    render(
      <I18nProvider>
        <FileDropZone
          status="connected"
          errorMessage={null}
          {...handlers}
          p2pEnabled
          canReceiveToDisk
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/save straight to disk/i)).toBeInTheDocument();
    expect(screen.queryByText(/100 MB/i)).not.toBeInTheDocument();
  });

  it("lets the sender pick one recipient instead of everyone", () => {
    const onRecipientChange = vi.fn();
    render(
      <I18nProvider>
        <FileDropZone
          status="connected"
          errorMessage={null}
          {...handlers}
          p2pEnabled
          peers={[
            { id: "peer-1", name: "Ken" },
            { id: "peer-2", name: "Mai" },
          ]}
          recipientId=""
          onRecipientChange={onRecipientChange}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("option", { name: "Everyone (2)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Send to"), { target: { value: "peer-2" } });
    expect(onRecipientChange).toHaveBeenCalledWith("peer-2");
  });

  it("shows the P2P error instead of a generic relay error", () => {
    render(
      <I18nProvider>
        <FileDropZone
          status="connected"
          errorMessage="relay problem"
          p2pError="No one else is in the room yet."
          {...handlers}
          p2pEnabled
        />
      </I18nProvider>,
    );

    expect(screen.getByText("No one else is in the room yet.")).toBeInTheDocument();
    expect(screen.queryByText("relay problem")).not.toBeInTheDocument();
  });

  it("waits for peers before promising a direct send", () => {
    render(
      <I18nProvider>
        <FileDropZone status="connected" errorMessage={null} {...handlers} p2pEnabled />
      </I18nProvider>,
    );
    expect(screen.getByText(/Waiting for someone to join/i)).toBeInTheDocument();
  });
});

describe("TransferList P2P cards", () => {
  it("shows peer, route, status and progress for a transfer", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{ f1: p2pTransfer() }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/with Ken/)).toBeInTheDocument();
    expect(screen.getByText(/Incoming/)).toBeInTheDocument();
    expect(screen.getByText(/direct/)).toBeInTheDocument();
    expect(screen.getByText(/Transferring/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it("accepts an incoming offer straight from the click", () => {
    const onAcceptTransfer = vi.fn();
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          onAcceptTransfer={onAcceptTransfer}
          transfers={{ f1: p2pTransfer({ status: "offered", progress: 0 }) }}
        />
      </I18nProvider>,
    );

    const accept = screen.getByRole("button", { name: /Accept movie.mp4/ });
    fireEvent.click(accept);
    expect(onAcceptTransfer).toHaveBeenCalledWith("in:peer-1:f1");
  });

  it("pauses, resumes and cancels by transfer id", () => {
    const onPauseTransfer = vi.fn();
    const onResumeTransfer = vi.fn();
    const onCancelTransfer = vi.fn();

    const { rerender } = render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          onPauseTransfer={onPauseTransfer}
          onResumeTransfer={onResumeTransfer}
          onCancelTransfer={onCancelTransfer}
          transfers={{ f1: p2pTransfer() }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Pause movie.mp4/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel movie.mp4/ }));
    expect(onPauseTransfer).toHaveBeenCalledWith("in:peer-1:f1");
    expect(onCancelTransfer).toHaveBeenCalledWith("in:peer-1:f1");

    rerender(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          onPauseTransfer={onPauseTransfer}
          onResumeTransfer={onResumeTransfer}
          onCancelTransfer={onCancelTransfer}
          transfers={{ f1: p2pTransfer({ status: "paused" }) }}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Resume movie.mp4/ }));
    expect(onResumeTransfer).toHaveBeenCalledWith("in:peer-1:f1");
  });

  it("reports a disk-saved completion without a download link", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({
              status: "completed",
              progress: 100,
              savedToDisk: true,
              connectionType: "relay",
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Saved to disk")).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.getByText(/relay/)).toBeInTheDocument();
  });

  it("keeps the save action for memory-mode completions", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({
              status: "completed",
              progress: 100,
              url: "blob:abc",
              savedToDisk: false,
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Save").closest("a")).toHaveAttribute("download", "movie.mp4");
  });

  it("never reports Sent from local queueing alone", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({
              direction: "outgoing",
              status: "offered",
              progress: 0,
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Waiting for acceptance/)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    expect(screen.queryByText(/Sent/)).not.toBeInTheDocument();
  });

  it("renders the engine error message on a failed transfer", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({ status: "error", error: "checksum mismatch" }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("checksum mismatch")).toBeInTheDocument();
    expect(screen.getByText(/Failed/)).toBeInTheDocument();
  });
});
