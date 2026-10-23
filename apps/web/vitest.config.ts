import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  // Database test files share one disposable database, so they run one at a time.
  test: { environment: "node", fileParallelism: false },
});
