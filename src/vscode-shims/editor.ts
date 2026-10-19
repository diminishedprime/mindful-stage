import {
  Position,
  Range,
  Selection,
  type TextEditor,
  TextEditorRevealType,
  window,
  workspace,
} from "vscode";
import { type Cursor, type Editor, NOWHERE } from "../types";

export class VscodeEditor implements Editor {
  visibleFiles(): string[] {
    return [
      ...new Set(
        window.visibleTextEditors.map((editor) => editor.document.uri.fsPath),
      ),
    ];
  }

  editorsShowing(file: string): TextEditor[] {
    return window.visibleTextEditors.filter(
      (editor) => editor.document.uri.fsPath === file,
    );
  }

  numberOfLines(file: string): number {
    return this.editorsShowing(file)[0]?.document.lineCount ?? 0;
  }

  isDirty(file: string): boolean {
    return (
      workspace.textDocuments.find((document) => document.uri.fsPath === file)
        ?.isDirty ?? false
    );
  }

  active(): Cursor {
    const editor = window.activeTextEditor;
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

  async open(path: string, line: number): Promise<void> {
    const doc = await workspace.openTextDocument(path);
    const editor = await window.showTextDocument(doc, {
      preserveFocus: false,
    });
    const pos = new Position(line - 1, 0);
    editor.selection = new Selection(pos, pos);
    editor.revealRange(
      new Range(pos, pos),
      TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
}
