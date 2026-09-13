import * as vscode from "vscode";
import type { StatusBar } from "../types";

export class VscodeStatusBar implements StatusBar {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );

  constructor() {
    this.item.name = "Mindful Stage";
    this.item.command = "mindfulStage.pickRepo";
    this.item.show();
  }

  show(summary: string, detail: string): void {
    this.item.text = `$(git-commit) ${summary}`;
    this.item.tooltip = new vscode.MarkdownString(detail);
  }

  async dispose(): Promise<void> {
    this.item.dispose();
  }
}
