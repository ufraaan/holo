import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Tests use the local origin; the checked-in vars describe production.
      miniflare: { bindings: { ORIGINS: "http://localhost:3000" } },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
