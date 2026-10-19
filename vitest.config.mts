import { unrunRunner } from "unplugin-macros";
import Macros from "unplugin-macros/vite";
import { configDefaults, defineConfig } from "vitest/config";
import { performanceCores } from "./scripts/performance-cores.mjs";

const strykerWorker = process.env.STRYKER_MUTATOR_WORKER;

const profiling = process.env.MINDFUL_STAGE_PROFILE !== undefined;

export default defineConfig({
  ...(strykerWorker === undefined
    ? {}
    : { cacheDir: `node_modules/.vite/stryker-${strykerWorker}` }),
  plugins: [Macros({ runner: unrunRunner() })],
  test: {
    exclude: [...configDefaults.exclude, ".stryker-tmp/**"],
    ...(profiling
      ? {
          include: ["test/profile/**/*.profile.ts"],
          pool: "forks",
        }
      : { pool: "threads" }),
    fsModuleCache: true,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "memfs",
            "zod",
            "gitignore-fs",
            "tsyringe",
            "parse-diff",
            "@rushstack/lookup-by-path",
          ],
        },
      },
    },
    maxWorkers: performanceCores(),
    setupFiles: ["test/setup/environment.ts"],
  },
});
