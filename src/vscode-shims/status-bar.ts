import * as vscode from "vscode";
import type { StatusBar } from "../types";

export class VscodeStatusBar implements StatusBar {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );

  constructor() {
    this.item.tooltip = "Mindful Stage: unstaged work across the workspace";
    this.item.show();
  }

  show(summary: string): void {
    this.item.text = `$(git-commit) ${summary}`;
  }

  async dispose(): Promise<void> {
    this.item.dispose();
  }
}
