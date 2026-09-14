import * as fs from "fs";
import * as path from "path";

let destination: string | undefined;

export function logTo(directory: string): string {
  fs.mkdirSync(directory, { recursive: true });
  destination = path.join(directory, "mindful-stage.log");
  return destination;
}

export function log(message: string): void {
  if (destination === undefined) {
    return;
  }
  fs.appendFileSync(destination, `${new Date().toISOString()} ${message}\n`);
}
