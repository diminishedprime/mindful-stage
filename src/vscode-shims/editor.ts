import * as vscode from "vscode";
import type { Editor, Position } from "../types";

export class VscodeEditor implements Editor {
  active(): Position | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    return {
      path: editor.document.uri.fsPath,
      line: editor.selection.active.line + 1,
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
