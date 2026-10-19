import * as path from "path";
import { type PaletteKey, SCOPES } from "../../src/types";
import type { CountingFs } from "./counting-fs";
import type { CountingGitCommands } from "./counting-git-commands";
import type { FakeEditor } from "./fakes/editor";
import type { FakeFileDecorations } from "./fakes/file-decorations";
import type { FakePicker } from "./fakes/picker";
import type { FakeStatusBar } from "./fakes/status-bar";
import type { FakeVscode } from "./fakes/vscode";
import type { OutOfBand } from "./out-of-band";

export class EditorView {
  constructor(
    private readonly editor: FakeEditor,
    private readonly polyrepo: OutOfBand,
  ) {}

  openLine(): number | undefined {
    const cursor = this.editor.active();
    return cursor.kind === "nowhere" ? undefined : cursor.at.line;
  }

  openFile(): string | undefined {
    const cursor = this.editor.active();
    return cursor.kind === "nowhere"
      ? undefined
      : path.relative(this.polyrepo.workspace, cursor.at.path);
  }
}

export class StatusBarView {
  constructor(
    private readonly statusBar: FakeStatusBar,
    private readonly picker: PickerView,
    private readonly run: (command: string) => Promise<void>,
  ) {}

  text(): string | undefined {
    return this.statusBar.summary;
  }

  history(): string[] {
    return this.statusBar.summaries;
  }

  async click(): Promise<void> {
    const command = this.statusBar.clickRuns;
    if (command === undefined) {
      throw new Error("clicking the status bar does nothing");
    }
    this.picker.beforeClick();
    await this.run(command);
  }
}

export class ExplorerView {
  constructor(
    private readonly badges: FakeFileDecorations,
    private readonly polyrepo: OutOfBand,
  ) {}

  on(file: string): string {
    return this.badges.badgeOn(this.polyrepo.pathTo(file));
  }

  colourOf(file: string): string {
    const id = this.badges.colourOn(this.polyrepo.pathTo(file));
    return COLOUR_NAMES[id.replace("mindfulStage.", "") as PaletteKey] ?? id;
  }

  files(): string[] {
    return this.badges.badged.map((file) =>
      path.relative(this.polyrepo.workspace, file),
    );
  }
}

export type Band = "solid" | "hatched";

export type GutterLine = {
  band: Band | undefined;
  colour: string | undefined;
  wedges: { top?: string; bottom?: string };
};

const COLOUR_NAMES: Record<PaletteKey, string> = {
  stagedChange: "staged change",
  unstagedChange: "unstaged change",
  untracked: "untracked",
  stagedDeletion: "staged deletion",
  unstagedDeletion: "unstaged deletion",
};

export class GutterColours {
  constructor(
    private readonly vscode: FakeVscode,
    private readonly packageJson: unknown,
  ) {}

  name(color: string, keys: PaletteKey[]): string {
    for (const key of keys) {
      const source = this.sourceOf(key, color);
      if (source !== undefined) {
        return `${source} ${COLOUR_NAMES[key]}`;
      }
    }
    return color;
  }

  private sourceOf(key: PaletteKey, color: string): string | undefined {
    if (this.customised(key) === color) {
      return "custom";
    }
    if (this.themed(key) === color) {
      return "theme";
    }
    if (this.defaults(key).includes(color)) {
      return "default";
    }
    return undefined;
  }

  private customised(key: PaletteKey): string | undefined {
    const workbench = this.vscode.workspace.getConfiguration("workbench");
    const customisations =
      workbench.get<Record<string, unknown>>("colorCustomizations") ?? {};
    const forTheme = customisations[`[${workbench.get<string>("colorTheme")}]`];
    const id = `mindfulStage.${key}`;
    const value =
      (forTheme as Record<string, unknown> | undefined)?.[id] ??
      customisations[id];
    return typeof value === "string" ? value : undefined;
  }

  private themed(key: PaletteKey): string | undefined {
    const wanted = SCOPES[key];
    const tokens = this.vscode.tokenColours();
    const scopesOf = (scope: string | string[] | undefined) =>
      typeof scope === "string"
        ? scope.split(",").map((part) => part.trim())
        : (scope ?? []);
    const matching = (hit: (scope: string) => boolean) =>
      tokens
        .filter((token) => scopesOf(token.scope).some(hit))
        .map((token) => token.settings?.foreground)
        .filter((foreground) => foreground !== undefined)
        .at(-1);
    return (
      matching((scope) => scope === wanted) ??
      matching((scope) => scope.startsWith(`${wanted}.`))
    );
  }

  private defaults(key: PaletteKey): string[] {
    const colors =
      (
        this.packageJson as {
          contributes?: {
            colors?: { id: string; defaults: Record<string, string> }[];
          };
        }
      ).contributes?.colors ?? [];
    const contributed = colors.find(({ id }) => id === `mindfulStage.${key}`);
    return Object.values(contributed?.defaults ?? {});
  }
}

export class GutterView {
  constructor(
    private readonly editor: FakeEditor,
    private readonly polyrepo: OutOfBand,
    private readonly colours: GutterColours,
  ) {}

  lines(file: string, band: Band): number[] {
    return [...this.icons(file)]
      .filter(([, icon]) => GutterView.bandOf(icon) === band)
      .map(([line]) => line)
      .sort((a, b) => a - b);
  }

  line(file: string, line: number): GutterLine {
    const icon = this.icons(file).get(line) ?? "";
    const band = GutterView.bandOf(icon);
    const wedges: GutterLine["wedges"] = {};
    for (const [, y, color] of icon.matchAll(
      /<path d="M[\d.]+,([\d.]+)[^"]*" fill="([^"]+)"\/>/g,
    )) {
      if (color !== "black") {
        wedges[y === "0" ? "top" : "bottom"] = this.colours.name(color!, [
          "unstagedDeletion",
          "stagedDeletion",
        ]);
      }
    }
    return {
      band,
      colour:
        band === undefined
          ? undefined
          : this.colours.name(
              GutterView.bandColor(icon)!,
              band === "solid"
                ? ["stagedChange"]
                : ["unstagedChange", "untracked"],
            ),
      wedges,
    };
  }

  private icons(file: string): Map<number, string> {
    return this.editor.textEditorFor(this.polyrepo.pathTo(file)).icons();
  }

  private static bandOf(icon: string): Band | undefined {
    if (/stroke="/.test(icon)) {
      return "hatched";
    }
    if (GutterView.solidColor(icon) !== undefined) {
      return "solid";
    }
    return undefined;
  }

  private static bandColor(icon: string): string | undefined {
    return /stroke="([^"]+)"/.exec(icon)?.[1] ?? GutterView.solidColor(icon);
  }

  private static solidColor(icon: string): string | undefined {
    for (const [, color] of icon.matchAll(/<rect [^>]*fill="([^"]+)"\/>/g)) {
      if (color !== "white") {
        return color;
      }
    }
    return undefined;
  }
}

export class GitView {
  private countedFrom = 0;

  constructor(
    private readonly commands: CountingGitCommands,
    private readonly polyrepo: OutOfBand,
  ) {}

  holdDiffsOf(file: string): () => void {
    return this.commands.holdDiffsOf(this.polyrepo.pathTo(file));
  }

  startCounting(): void {
    this.countedFrom = this.commands.statusRuns;
  }

  statusRefreshes(): number {
    return this.commands.statusRuns - this.countedFrom;
  }
}

export class FilesView {
  constructor(private readonly files: CountingFs) {}

  lookedInside(name: string): boolean {
    return this.files.listed.some((dir) => dir.split(path.sep).includes(name));
  }
}

export class MessagesView {
  constructor(private readonly messages: () => string[]) {}

  shown(): string[] {
    return this.messages();
  }
}

export class PickerView {
  private shownBefore = 0;

  constructor(private readonly picker: FakePicker) {}

  choose(repo: string): void {
    this.picker.picks(repo);
  }

  beforeClick(): void {
    this.shownBefore = this.picker.offered.length;
  }

  wasShown(): boolean {
    return this.picker.offered.length > this.shownBefore;
  }

  offers(): string[] {
    if (!this.wasShown()) {
      return [];
    }
    return this.picker.choices.map(
      (choice) => `${choice.label} ${choice.description}`,
    );
  }
}
