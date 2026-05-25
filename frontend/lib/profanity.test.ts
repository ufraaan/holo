import { describe, it, expect } from "vitest";
import { containsProfanity } from "./profanity";

describe("containsProfanity", () => {
  it("detects exact profane word", () => {
    expect(containsProfanity("fuck")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(containsProfanity("FUCK")).toBe(true);
    expect(containsProfanity("Fuck")).toBe(true);
  });

  it("respects word boundaries - substring not at boundary", () => {
    expect(containsProfanity("assassin")).toBe(false);
    expect(containsProfanity("class")).toBe(false);
  });

  it("detects profane word at word boundaries", () => {
    expect(containsProfanity("fuck this")).toBe(true);
    expect(containsProfanity("this fuck")).toBe(true);
  });

  it("allows clean words", () => {
    expect(containsProfanity("hello")).toBe(false);
    expect(containsProfanity("abc123")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsProfanity("")).toBe(false);
  });
});
