import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.mk-goal/**",
      "**/tests/e2e/**",
    ],
  },
});
