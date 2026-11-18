import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Tests run local and STUN-only; the checked-in vars describe production.
      miniflare: { bindings: { ORIGINS: "http://localhost:3000", TURN_ENABLED: "false" } },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
