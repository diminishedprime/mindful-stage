import { RelativePattern, workspace } from "vscode";
import type { Disposable, OnChange, Watcher } from "../types";

export class VscodeWatcher implements Watcher {
  async watch(root: string, onChange: OnChange): Promise<Disposable> {
    const watcher = workspace.createFileSystemWatcher(
      new RelativePattern(root, "**/*"),
    );
    watcher.onDidChange((uri) => onChange(uri.fsPath, "changed"));
    watcher.onDidCreate((uri) => onChange(uri.fsPath, "created"));
    watcher.onDidDelete((uri) => onChange(uri.fsPath, "deleted"));
    return { dispose: async () => watcher.dispose() };
  }
}
