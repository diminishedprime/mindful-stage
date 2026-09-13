import * as vscode from "vscode";
import type { GitRefresher } from "../types";

export class VscodeGitRefresher implements GitRefresher {
  refresh(): void {
    void vscode.commands.executeCommand("git.refresh").then(undefined, () => {});
  }
}
