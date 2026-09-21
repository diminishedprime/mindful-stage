import * as vscode from "vscode";
import { type Cursor, type Editor, NOWHERE } from "../types";

export class VscodeEditor implements Editor {
  visibleFiles(): string[] {
    return [
      ...new Set(
        vscode.window.visibleTextEditors.map(
          (editor) => editor.document.uri.fsPath,
        ),
      ),
    ];
  }

  editorsShowing(file: string): vscode.TextEditor[] {
    return vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.fsPath === file,
    );
  }

  numberOfLines(file: string): number {
    return this.editorsShowing(file)[0]?.document.lineCount ?? 0;
  }

  active(): Cursor {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      return NOWHERE;
    }
    return {
      kind: "somewhere",
      at: {
        path: editor.document.uri.fsPath,
        line: editor.selection.active.line + 1,
      },
    };
  }

  async open(path: string, line?: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(path);
    const editor = await vscode.window.showTextDocument(doc, {
      preserveFocus: false,
    });
    if (line === undefined) {
      return;
    }
    const pos = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
}
