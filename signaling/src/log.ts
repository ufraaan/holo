type Field = string | number | boolean | null | undefined;

/**
 * Structured JSON log. Callers pass only explicit fields: never SDP, chat or
 * text bodies, client IDs, room IDs, or TURN secrets.
 */
export function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, Field> = {},
): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Error names/messages can carry remote content; keep only the error name. */
export function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
