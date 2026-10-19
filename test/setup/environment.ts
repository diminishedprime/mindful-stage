import * as fs from "fs";
import * as os from "os";
import * as path from "path";

process.env.XDG_CONFIG_HOME = fs.mkdtempSync(
  path.join(os.tmpdir(), "mindful-stage-xdg-"),
);
process.env.GIT_AUTHOR_DATE = "2026-01-01T00:00:00Z";
process.env.GIT_COMMITTER_DATE = "2026-01-01T00:00:00Z";
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";
