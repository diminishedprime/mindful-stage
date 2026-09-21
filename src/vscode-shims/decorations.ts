import * as vscode from "vscode";
import { inject, injectable } from "tsyringe";
import { EDITOR, GUTTER_ICON, PALETTE } from "../di-tokens";
import {
  type Band,
  type Edge,
  GutterIcon,
  NO_BAND,
  NO_EDGE,
} from "../display/gutter-icon";
import { Palette } from "../palette";
import { render } from "../display/svg";
import {
  Change,
  type Composition,
  type Decorations,
  Deletion,
  type PaletteKey,
} from "../types";
import { VscodeEditor } from "./editor";

const CHANGES = Object.values(Change);
const DELETIONS = Object.values(Deletion);

type Mark = vscode.TextEditorDecorationType;

type MarkPalette = Record<Change, Record<Deletion, Record<Deletion, Mark>>>;

const EMPTY: readonly vscode.Range[] = [];

@injectable()
export class VscodeDecorations implements Decorations {
  private marks: MarkPalette | undefined;

  constructor(
    @inject(EDITOR) private readonly editors: VscodeEditor,
    @inject(GUTTER_ICON) private readonly icons: GutterIcon,
    @inject(PALETTE) private readonly palette: Palette,
  ) {
    this.marks = this.build();
  }

  render(file: string, compositions: Composition[]): void {
    const marks = this.marks;
    if (marks === undefined) {
      return;
    }
    const ranges = new Map<Mark, vscode.Range[]>();
    for (const { mark, lines } of compositions) {
      ranges.set(
        marks[mark.change][mark.above][mark.below],
        lines.map((line) => new vscode.Range(line, 0, line, 0)),
      );
    }
    for (const editor of this.editors.editorsShowing(file)) {
      for (const mark of VscodeDecorations.marksIn(marks)) {
        editor.setDecorations(mark, ranges.get(mark) ?? EMPTY);
      }
    }
  }

  async recolor(): Promise<void> {
    await this.palette.reload();
    this.release();
    this.marks = this.build();
  }

  async dispose(): Promise<void> {
    this.release();
  }

  private release(): void {
    if (this.marks === undefined) {
      return;
    }
    for (const mark of VscodeDecorations.marksIn(this.marks)) {
      mark.dispose();
    }
    this.marks = undefined;
  }

  private build(): MarkPalette {
    const palette = {} as MarkPalette;
    for (const change of CHANGES) {
      palette[change] = {} as Record<Deletion, Record<Deletion, Mark>>;
      for (const above of DELETIONS) {
        palette[change][above] = {} as Record<Deletion, Mark>;
        for (const below of DELETIONS) {
          palette[change][above][below] = this.markFor(change, above, below);
        }
      }
    }
    return palette;
  }

  private static *marksIn(palette: MarkPalette): Iterable<Mark> {
    for (const byAbove of Object.values(palette)) {
      for (const byBelow of Object.values(byAbove)) {
        for (const mark of Object.values(byBelow)) {
          yield mark;
        }
      }
    }
  }

  private markFor(change: Change, above: Deletion, below: Deletion): Mark {
    const markup = render(
      this.icons.draw({
        band: this.bandFor(change),
        above: this.edgeFor(above),
        below: this.edgeFor(below),
      }),
    );
    return vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.parse(
        `data:image/svg+xml,${encodeURIComponent(markup)}`,
      ),
      gutterIconSize: "contain",
    });
  }

  private bandFor(change: Change): Band {
    switch (change) {
      case Change.Nothing:
        return NO_BAND;
      case Change.Staged:
        return { kind: "solid", color: this.color("stagedChange") };
      case Change.Unstaged:
        return { kind: "hatched", color: this.color("unstagedChange") };
      case Change.Untracked:
        return { kind: "hatched", color: this.color("untracked") };
    }
  }

  private edgeFor(deletion: Deletion): Edge {
    switch (deletion) {
      case Deletion.Nothing:
        return NO_EDGE;
      case Deletion.Staged:
        return { kind: "wedge", color: this.color("stagedDeletion") };
      case Deletion.Unstaged:
        return { kind: "wedge", color: this.color("unstagedDeletion") };
    }
  }

  private color(of: PaletteKey): string {
    return this.palette.resolve(of);
  }
}
