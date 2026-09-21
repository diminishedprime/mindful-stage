import * as vscode from "vscode";
import type { Events } from "../types";

export class VscodeEvents implements Events {
  private readonly subscriptions: vscode.Disposable[] = [];

  visibleFilesChanged(handler: (files: string[]) => void): void {
    this.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) =>
        handler([
          ...new Set(editors.map((editor) => editor.document.uri.fsPath)),
        ]),
      ),
    );
  }

  colorsChanged(handler: () => void): void {
    this.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => handler()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("workbench.colorCustomizations")) {
          handler();
        }
      }),
    );
  }

  decorationsToggled(handler: () => void): void {
    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("mindfulStage.decorations")) {
          handler();
        }
      }),
    );
  }

  async dispose(): Promise<void> {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}
