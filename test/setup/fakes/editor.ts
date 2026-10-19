import {
  type Cursor,
  type Editor,
  type Fs,
  NOWHERE,
  type Position,
  type Watcher,
} from "../../../src/types";
import type { FakeDecorationType, FakeRange, FakeVscode } from "./vscode";

export class FakeTextEditor {
  private readonly decorations = new Map<FakeDecorationType, FakeRange[]>();

  constructor(private readonly lineCount: () => number) {}

  setDecorations(mark: FakeDecorationType, ranges: readonly unknown[]): void {
    this.decorations.set(mark, ranges as FakeRange[]);
  }

  icons(): Map<number, string> {
    const icons = new Map<number, string>();
    for (const [mark, ranges] of this.decorations) {
      if (mark.disposed) {
        continue;
      }
      for (const range of ranges) {
        icons.set(
          Math.min(range.startLine, this.lineCount() - 1) + 1,
          mark.icon,
        );
      }
    }
    return icons;
  }
}

export class FakeEditor implements Editor {
  opened: Position[] = [];
  private readonly textEditors = new Map<string, FakeTextEditor>();
  private readonly documents = new Map<
    string,
    { lines: string[]; dirty: boolean }
  >();

  constructor(
    private readonly fs: Fs,
    private readonly vscode: FakeVscode,
  ) {}

  watching(watcher: Watcher): Watcher {
    return {
      watch: (root, onChange) =>
        watcher.watch(root, async (path, event) => {
          await this.reload(path);
          return onChange(path, event);
        }),
    };
  }

  active(): Cursor {
    const at = this.opened.at(-1);
    if (at === undefined) {
      return NOWHERE;
    }
    return { kind: "somewhere", at };
  }

  visibleFiles(): string[] {
    const cursor = this.active();
    if (cursor.kind === "nowhere") {
      return [];
    }
    return [cursor.at.path];
  }

  editorsShowing(file: string): FakeTextEditor[] {
    if (!this.visibleFiles().includes(file)) {
      return [];
    }
    return [this.textEditorFor(file)];
  }

  textEditorFor(file: string): FakeTextEditor {
    let editor = this.textEditors.get(file);
    if (editor === undefined) {
      editor = new FakeTextEditor(() => this.numberOfLines(file));
      this.textEditors.set(file, editor);
    }
    return editor;
  }

  numberOfLines(file: string): number {
    if (!this.visibleFiles().includes(file)) {
      return 0;
    }
    return this.documents.get(file)?.lines.length ?? 0;
  }

  isDirty(file: string): boolean {
    return this.documents.get(file)?.dirty ?? false;
  }

  async deleteLinesWithoutSaving(
    file: string,
    from: number,
    count: number,
  ): Promise<void> {
    const document = await this.documentFor(file);
    document.lines.splice(from - 1, count);
    document.dirty = true;
  }

  save(file: string): string {
    const document = this.documents.get(file)!;
    document.dirty = false;
    return document.lines.join("\n");
  }

  async open(path: string, line: number): Promise<void> {
    await this.documentFor(path);
    const before = this.visibleFiles();
    this.opened.push({ path, line });
    if (before[0] !== path) {
      await this.vscode.showing(this.visibleFiles());
    }
  }

  private async documentFor(
    file: string,
  ): Promise<{ lines: string[]; dirty: boolean }> {
    let document = this.documents.get(file);
    if (document === undefined) {
      document = { lines: await this.linesIn(file), dirty: false };
      this.documents.set(file, document);
    }
    return document;
  }

  private async reload(file: string): Promise<void> {
    const document = this.documents.get(file);
    if (document !== undefined && !document.dirty) {
      document.lines = await this.linesIn(file);
    }
  }

  private async linesIn(file: string): Promise<string[]> {
    try {
      return new TextDecoder()
        .decode(await this.fs.promises.readFile(file))
        .split("\n");
    } catch {
      return [];
    }
  }
}
