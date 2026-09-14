import "reflect-metadata";
import type * as vscode from "vscode";
import { Extension } from "./extension";

export function activate(context: vscode.ExtensionContext): void {
  new Extension(context);
}

export function deactivate(): void {}
