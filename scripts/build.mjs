import { build } from "esbuild";
import { unrunRunner } from "unplugin-macros";
import Macros from "unplugin-macros/esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  mainFields: ["module", "main"],
  external: ["vscode"],
  outfile: "dist/main.js",
  plugins: [Macros({ runner: unrunRunner() })],
});
