import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "mindful-stage-xdg-"));
fs.mkdirSync(path.join(configHome, "git"));
fs.writeFileSync(path.join(configHome, "git", "ignore"), "*.local.json\n");
process.env.XDG_CONFIG_HOME = configHome;
