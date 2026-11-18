// Secrets are not part of `wrangler types` output; declare them so the
// generated Env stays the single source of truth for bindings and vars.
interface Env {
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}
