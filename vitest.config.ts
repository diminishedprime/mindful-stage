import { availableParallelism } from "os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxConcurrency: availableParallelism(),
    setupFiles: ["test/setup.ts"],
  },
});
