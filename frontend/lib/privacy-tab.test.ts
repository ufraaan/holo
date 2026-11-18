import { waitFor } from "@testing-library/react";
import { getTabTitle, hideTabIdentity, setTabTitle } from "./privacy-tab";

let restore: (() => void) | undefined;

beforeEach(() => {
  document.head.innerHTML = '<title>Holo room</title><link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="32x32"><link rel="apple-touch-icon" href="/apple.png">';
});

afterEach(() => {
  restore?.();
  restore = undefined;
  document.head.innerHTML = "";
});

it("blanks the title and every icon, then restores their exact attributes", () => {
  const original = document.head.innerHTML;
  restore = hideTabIdentity();
  expect(document.title).toBe("\u200b");
  const icons = document.head.querySelectorAll<HTMLLinkElement>("link");
  expect(icons).toHaveLength(3);
  for (const icon of icons) {
    expect(icon.href).toMatch(/^data:image\/png;base64,/);
    expect(icon.type).toBe("image/png");
    expect(icon.getAttribute("sizes")).toBe("any");
  }
  restore();
  restore = undefined;
  expect(document.head.innerHTML).toBe(original);
});

it("keeps metadata updates hidden and restores the latest app title and icon", async () => {
  restore = hideTabIdentity();
  document.title = "2 unread messages · Holo";
  const icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
  icon.href = "/updated.ico";
  const addedIcon = document.createElement("link");
  addedIcon.rel = "icon";
  addedIcon.href = "/new.png";
  document.head.append(addedIcon);
  await waitFor(() => {
    expect(document.title).toBe("\u200b");
    expect(icon.href).toMatch(/^data:image\/png/);
    expect(addedIcon.href).toMatch(/^data:image\/png/);
  });
  restore();
  restore = undefined;
  expect(document.title).toBe("2 unread messages · Holo");
  expect(icon.getAttribute("href")).toBe("/updated.ico");
  expect(addedIcon.getAttribute("href")).toBe("/new.png");
});

it("handles a page without icons and pending title changes on exit", () => {
  document.head.querySelectorAll("link").forEach((icon) => icon.remove());
  restore = hideTabIdentity();
  expect(document.head.querySelector('link[rel="icon"]')).not.toBeNull();
  document.title = "Updated room";
  restore();
  restore = undefined;
  expect(document.title).toBe("Updated room");
  expect(document.head.querySelector("link")).toBeNull();
});


it("lets unread alerts save and restore the normal title while masked", () => {
  restore = hideTabIdentity();
  const originalTitle = getTabTitle();
  setTabTitle("1 unread message · Holo");
  expect(document.title).toBe("\u200b");
  restore();
  restore = undefined;
  expect(document.title).toBe("1 unread message · Holo");
  setTabTitle(originalTitle);
  expect(document.title).toBe("Holo room");
});
