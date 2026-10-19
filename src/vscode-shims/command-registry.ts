import { commands, type Disposable } from "vscode";
import type { CommandRegistry } from "../types";

export const PREFIX = "mindfulStage";

export class VscodeCommandRegistry implements CommandRegistry {
  private readonly registered: Disposable[] = [];

  register(name: string, run: () => Promise<void>): void {
    this.registered.push(commands.registerCommand(`${PREFIX}.${name}`, run));
  }

  async dispose(): Promise<void> {
    for (const command of this.registered) {
      command.dispose();
    }
  }
}
