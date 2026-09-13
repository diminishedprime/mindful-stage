import * as vscode from "vscode";
import type { Disposable, Watcher } from "../types";

export class VscodeWatcher implements Watcher {
  async watch(
    root: string,
    onChange: (path: string) => void,
  ): Promise<Disposable> {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, "**/*"),
    );
    watcher.onDidChange((uri) => onChange(uri.fsPath));
    watcher.onDidCreate((uri) => onChange(uri.fsPath));
    watcher.onDidDelete((uri) => onChange(uri.fsPath));
    return { dispose: async () => watcher.dispose() };
  }
}
