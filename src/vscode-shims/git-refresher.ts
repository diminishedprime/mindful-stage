import * as vscode from "vscode";
import type { GitRefresher } from "../types";

type GitApi = {
  getRepository(uri: vscode.Uri): { status(): Promise<void> } | null;
};

export class VscodeGitRefresher implements GitRefresher {
  refresh(repo: string): void {
    const api = vscode.extensions
      .getExtension("vscode.git")
      ?.exports.getAPI(1) as GitApi | undefined;
    void api?.getRepository(vscode.Uri.file(repo))?.status();
  }
}
