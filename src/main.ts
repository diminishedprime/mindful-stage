import "reflect-metadata";
import type * as vscode from "vscode";
import { start } from "./graph";

export function activate(context: vscode.ExtensionContext): void {
  start(context);
}

export function deactivate(): void {}
