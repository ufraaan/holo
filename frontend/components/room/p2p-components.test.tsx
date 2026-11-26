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
  it("lets users select multiple files in one picker action", () => {
    const onInputChange = vi.fn();
    render(
      <I18nProvider>
        <FileDropZone status="connected" errorMessage={null} {...handlers} onInputChange={onInputChange} />
      </I18nProvider>,
    );
    const input = screen.getByLabelText("Choose files");
    expect(input).toHaveAttribute("multiple");
    const files = [new File(["one"], "one.pdf"), new File(["two"], "two.pdf")];
    fireEvent.change(input, { target: { files } });
    expect(onInputChange).toHaveBeenCalledOnce();
    expect(onInputChange.mock.calls[0][0].target.files).toEqual(files);
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
  it("shows direction, status and progress without peer or route labels", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{ f1: p2pTransfer() }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(/with Ken/)).not.toBeInTheDocument();
    expect(screen.getByText(/Incoming/)).toBeInTheDocument();
    expect(screen.queryByText(/direct/)).not.toBeInTheDocument();
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

    const accept = screen.getByRole("button", { name: /Save to disk movie.mp4/ });
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
    expect(screen.queryByText(/relay/)).not.toBeInTheDocument();
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

  it("shows a speed and ETA only while bytes are moving", () => {
    const { rerender } = render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({
              status: "transferring",
              bytesPerSecond: 1024 * 1024,
              etaSeconds: 75,
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("1.0 MB/s")).toBeInTheDocument();
    expect(screen.getByText("~1:15 left")).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          transfers={{
            f1: p2pTransfer({
              status: "paused",
              bytesPerSecond: 1024 * 1024,
              etaSeconds: 75,
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText("1.0 MB/s")).not.toBeInTheDocument();
    expect(screen.queryByText("~1:15 left")).not.toBeInTheDocument();
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

  it("shows queued files with cancel but no premature pause or resume", () => {
    render(
      <I18nProvider>
        <TransferList {...baseTransferListProps} transfers={{ f1: p2pTransfer({ direction: "outgoing", status: "queued", progress: 0 }) }} onCancelTransfer={vi.fn()} onPauseTransfer={vi.fn()} onResumeTransfer={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText(/Queued/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause|Resume/ })).not.toBeInTheDocument();
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

  it("explains a coded failure and offers a retry for the retained source", () => {
    const onRetryTransfer = vi.fn();
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          onRetryTransfer={onRetryTransfer}
          transfers={{
            f1: p2pTransfer({
              direction: "outgoing",
              status: "error",
              error: "peer sent an invalid acknowledgement",
              errorCode: "protocol",
              retryable: true,
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByText("The other side sent unexpected data, so the transfer stopped."),
    ).toBeInTheDocument();
    expect(screen.queryByText("peer sent an invalid acknowledgement")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Retry movie.mp4/ }));
    expect(onRetryTransfer).toHaveBeenCalledWith("in:peer-1:f1");
  });

  it("does not offer a retry when the receiving side cannot resume", () => {
    render(
      <I18nProvider>
        <TransferList
          {...baseTransferListProps}
          onRetryTransfer={vi.fn()}
          transfers={{
            f1: p2pTransfer({
              status: "error",
              error: "checksum mismatch",
              errorCode: "checksum",
            }),
          }}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByText("The transfer arrived corrupted. Send the file again."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });
});
