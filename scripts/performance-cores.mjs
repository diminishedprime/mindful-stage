import { execFileSync } from "child_process";
import { availableParallelism, platform } from "os";
import { fileURLToPath } from "url";

export function performanceCores() {
  if (platform() === "darwin") {
    try {
      const cores = Number(
        execFileSync("sysctl", ["-n", "hw.perflevel0.logicalcpu"], {
          encoding: "utf8",
        }).trim(),
      );
      if (cores > 0) {
        return cores;
      }
    } catch {
      return availableParallelism();
    }
  }
  return availableParallelism();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(performanceCores());
}
