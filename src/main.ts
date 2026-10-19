import "reflect-metadata";
import type { ExtensionContext } from "vscode";
import { start } from "./graph";

export function activate(context: ExtensionContext): Promise<void> {
  return start(context);
}
