import * as vscode from "vscode";
import type { Settings } from "../types";

export class VscodeSettings implements Settings {
  decorationsEnabled(): boolean {
    return (
      vscode.workspace
        .getConfiguration("mindfulStage")
        .get<boolean>("decorations") ?? true
    );
  }

  loggingEnabled(): boolean {
    return !!vscode.workspace
      .getConfiguration("mindfulStage")
      .get<boolean>("log");
  }

  colorTheme(): string {
    return (
      vscode.workspace
        .getConfiguration("workbench")
        .get<string>("colorTheme") ?? ""
    );
  }

  colorCustomizations(): Record<string, unknown> {
    return (
      vscode.workspace
        .getConfiguration("workbench")
        .get<Record<string, unknown>>("colorCustomizations") ?? {}
    );
  }
}
