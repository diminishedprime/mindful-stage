import * as fs from "fs/promises";
import { Session } from "inspector/promises";
import * as path from "path";
import { test } from "vitest";
import { startExtension } from "../setup/extension";

const LAB = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const PROFILES = path.resolve(
  __dirname,
  "..",
  "..",
  "node_modules",
  ".cache",
  "profiles",
);

test("starts up on the whole lab polyrepo", async () => {
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("Profiler.start");
  const sut = await startExtension({
    fixtures: false,
    workspaceFolders: () => [LAB],
  });
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();
  await fs.mkdir(PROFILES, { recursive: true });
  await fs.writeFile(
    path.join(PROFILES, "startup.cpuprofile"),
    JSON.stringify(profile),
  );
  const disposing = performance.now();
  await sut.dispose();
  const disposed = performance.now();

  console.log(sut.timeline.summary().join("\n"));
  console.log(
    `started in ${sut.startup.toFixed(0)}ms, disposed in ${(disposed - disposing).toFixed(0)}ms`,
  );
}, 300_000);
