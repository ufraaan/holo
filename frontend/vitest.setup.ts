import "@testing-library/jest-dom/vitest";

vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ className: "mock-font" }),
}));
