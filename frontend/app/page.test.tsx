import { fireEvent, render, screen } from "@testing-library/react";
import HomePage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("HomePage", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("joins a room using entered room id", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(pushMock).toHaveBeenCalledWith("/room/abc123");
  });

  it("does not join when room id is blank", () => {
    render(<HomePage />);

    fireEvent.change(screen.getByPlaceholderText("Enter room ID"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    expect(pushMock).not.toHaveBeenCalled();
  });
});
