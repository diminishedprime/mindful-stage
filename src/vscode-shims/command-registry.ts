import * as vscode from "vscode";
import type { CommandRegistry } from "../types";

const PREFIX = "mindfulStage";

export class VscodeCommandRegistry implements CommandRegistry {
  private readonly registered: vscode.Disposable[] = [];

  register(name: string, run: () => Promise<void>): void {
    this.registered.push(
      vscode.commands.registerCommand(`${PREFIX}.${name}`, run),
    );
  }

  async dispose(): Promise<void> {
    for (const command of this.registered) {
      command.dispose();
    }
  }
}
