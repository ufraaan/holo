import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import pt from "../messages/pt.json";
import de from "../messages/de.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NestedRecord = Record<string, any>;

function flattenKeys(obj: NestedRecord, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as NestedRecord, path);
    }
    return [path];
  });
}

const locales = { en, es, fr, pt, de };
const localeNames = Object.keys(locales);

describe("translation files", () => {
  const enKeys = flattenKeys(en as unknown as NestedRecord).sort();

  for (const name of localeNames) {
    if (name === "en") continue;

    it(`${name}.json has all keys present in en.json`, () => {
      const keys = flattenKeys(
        locales[name as keyof typeof locales] as unknown as NestedRecord,
      ).sort();
      const missing = enKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !enKeys.includes(k));

      expect(missing, `Missing keys in ${name}.json: ${missing.join(", ")}`).toStrictEqual([]);
      expect(extra, `Extra keys in ${name}.json: ${extra.join(", ")}`).toStrictEqual([]);
    });

    it(`${name}.json has no empty values`, () => {
      const obj = locales[name as keyof typeof locales] as NestedRecord;
      const keys = flattenKeys(obj);
      for (const key of keys) {
        const parts = key.split(".");
        let value: unknown = obj;
        for (const part of parts) {
          value = (value as NestedRecord)[part];
        }
        expect(
          typeof value === "string" && value.length > 0,
          `${name}.json "${key}" is empty`,
        ).toBe(true);
      }
    });
  }

  it("en.json is not empty", () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });
});
