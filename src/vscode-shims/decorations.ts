import { inject, injectable } from "tsyringe";
import { EDITOR, PALETTE, VSCODE } from "../di-tokens";
import { Palette } from "../palette";
import {
  colorPlaceholders,
  drawTemplates,
} from "../templates/gutter-templates.ts" with { type: "macro" };
import {
  type Composition,
  type Decorations,
  type Mark,
  type PaletteKey,
  SCOPES,
} from "../types";

type Decoration = { dispose(): void };

type Colors = Record<PaletteKey, string>;

const PALETTE_KEYS = Object.keys(SCOPES) as PaletteKey[];

const GUTTER_TEMPLATES = drawTemplates();

const COLOR_PLACEHOLDERS = colorPlaceholders();

export type VscodeDecorationApi = {
  window: {
    createTextEditorDecorationType(options: {
      gutterIconPath?: unknown;
      gutterIconSize?: string;
    }): Decoration;
  };
  Uri: { parse(value: string): unknown };
  Range: new (
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  ) => unknown;
};

type DecoratedEditors = {
  editorsShowing(file: string): {
    setDecorations(mark: Decoration, ranges: readonly unknown[]): void;
  }[];
};

type MarkPalette = Record<Mark, Decoration>;

const EMPTY: readonly unknown[] = [];

@injectable()
export class VscodeDecorations implements Decorations {
  private marks: MarkPalette | undefined;

  constructor(
    @inject(EDITOR) private readonly editors: DecoratedEditors,
    @inject(PALETTE) private readonly palette: Palette,
    @inject(VSCODE) private readonly vscode: VscodeDecorationApi,
  ) {}

  render(file: string, compositions: Composition[]): void {
    const marks = this.marks;
    if (marks === undefined) {
      return;
    }
    const ranges = new Map<Decoration, unknown[]>();
    for (const { mark, lines } of compositions) {
      ranges.set(
        marks[mark],
        lines.map((line) => new this.vscode.Range(line, 0, line, 0)),
      );
    }
    for (const editor of this.editors.editorsShowing(file)) {
      for (const decoration of Object.values(marks)) {
        editor.setDecorations(decoration, ranges.get(decoration) ?? EMPTY);
      }
    }
  }

  async recolor(): Promise<void> {
    const colours = await this.palette.colours();
    this.release();
    this.marks = this.build(colours);
  }

  async dispose(): Promise<void> {
    this.release();
  }

  private release(): void {
    if (this.marks === undefined) {
      return;
    }
    for (const decoration of Object.values(this.marks)) {
      decoration.dispose();
    }
    this.marks = undefined;
  }

  private build(colors: Colors): MarkPalette {
    return Object.fromEntries(
      Object.entries(GUTTER_TEMPLATES).map(([key, template]) => [
        key,
        this.decorationFor(VscodeDecorations.filled(template, colors)),
      ]),
    ) as MarkPalette;
  }

  private static filled(template: string, colors: Colors): string {
    let markup = template;
    for (const key of PALETTE_KEYS) {
      markup = markup.replaceAll(
        COLOR_PLACEHOLDERS[key],
        encodeURIComponent(colors[key]),
      );
    }
    return markup;
  }

  private decorationFor(encoded: string): Decoration {
    return this.vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.vscode.Uri.parse(`data:image/svg+xml,${encoded}`),
      gutterIconSize: "contain",
    });
  }
}
