import { StatusBarAlignment, window } from "vscode";
import { Icon } from "../icons";
import type { StatusBar } from "../types";
import { PREFIX } from "./command-registry";

export class VscodeStatusBar implements StatusBar {
  private readonly item = window.createStatusBarItem(StatusBarAlignment.Left);

  constructor() {
    this.item.name = "Mindful Stage";
    this.item.show();
  }

  show(summary: string): void {
    this.item.text = `$(${Icon.Ms}) ${summary}`;
  }

  whenClicked(command: string): void {
    this.item.command = `${PREFIX}.${command}`;
  }

  async dispose(): Promise<void> {
    this.item.dispose();
  }
}
