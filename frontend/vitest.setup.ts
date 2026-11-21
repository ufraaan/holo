import "@testing-library/jest-dom/vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font" }),
}));
