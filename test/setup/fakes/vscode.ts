import * as path from "path";
import { isDeepStrictEqual } from "util";
import type { DirEntry, Fs } from "../../../src/types";
import type { VscodeDecorationApi } from "../../../src/vscode-shims/decorations";
import type { VscodeEventsApi } from "../../../src/vscode-shims/events";
import type { VscodeLogApi } from "../../../src/logger";
import type { VscodeConfiguration } from "../../../src/vscode-shims/settings";
import type { VscodeThemeApi } from "../../../src/vscode-shims/theme";

type ThemeContribution = {
  id?: string;
  label?: string;
  uiTheme?: string;
  path?: string;
};

type PackageJson = {
  contributes?: {
    configuration?: { properties?: Record<string, { default?: unknown }> };
    themes?: ThemeContribution[];
  };
};

export type TokenColour = {
  scope?: string | string[];
  settings?: { foreground?: string };
};

type ThemeFile = { include?: string; tokenColors?: TokenColour[] };

type Extension = { extensionPath: string; packageJSON: unknown };

const KINDS: Record<string, number> = {
  vs: 1,
  "vs-dark": 2,
  "hc-black": 3,
  "hc-light": 4,
};

export class FakeUri {
  constructor(readonly value: string) {}
}

export class FakeRange {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {
    if (startLine < 0 || endLine < 0) {
      throw new Error("Illegal argument: line must be non-negative");
    }
  }
}

const decodedIcons = new Map<string, string>();

function decodedIcon(uri: string): string {
  let icon = decodedIcons.get(uri);
  if (icon === undefined) {
    icon = decodeURIComponent(uri.replace("data:image/svg+xml,", ""));
    decodedIcons.set(uri, icon);
  }
  return icon;
}

export class FakeDecorationType {
  disposed = false;
  readonly icon: string;

  constructor(uri: string) {
    this.icon = decodedIcon(uri);
  }

  dispose(): void {
    this.disposed = true;
  }
}

class FakeEvent<T> {
  private readonly listeners = new Set<(value: T) => unknown>();

  readonly subscribe = (listener: (value: T) => unknown) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  async fire(value: T): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => listener(value)));
  }
}

type ConfigurationChange = { affectsConfiguration(section: string): boolean };

type VisibleEditor = { document: { uri: { fsPath: string } } };

export class FakeVscode
  implements
    VscodeConfiguration,
    VscodeDecorationApi,
    VscodeEventsApi,
    VscodeLogApi,
    VscodeThemeApi
{
  static readonly EXTENSIONS = path.join(".vscode", "extensions");

  private readonly settingsFile: string;
  private readonly extensionsDir: string;
  private readonly defaults: Record<string, unknown>;
  private loadedSettings: Record<string, unknown> = {};
  private loadedExtensions: Extension[] = [];
  private loadedTokens: TokenColour[] = [];
  private readonly visibleEditorsChanged = new FakeEvent<
    readonly VisibleEditor[]
  >();
  private readonly colorThemeChanged = new FakeEvent<void>();
  private readonly configurationChanged = new FakeEvent<ConfigurationChange>();

  static async load(
    fs: Fs,
    root: string,
    packageJson: unknown,
  ): Promise<FakeVscode> {
    const vscode = new FakeVscode(fs, root, packageJson);
    await vscode.read();
    return vscode;
  }

  private constructor(
    private readonly fs: Fs,
    root: string,
    packageJson: unknown,
  ) {
    this.settingsFile = path.join(root, ".vscode", "settings.json");
    this.extensionsDir = path.join(root, FakeVscode.EXTENSIONS);
    const properties =
      (packageJson as PackageJson).contributes?.configuration?.properties ?? {};
    this.defaults = {
      ...Object.fromEntries(
        Object.entries(properties).map(([name, { default: value }]) => [
          name,
          value,
        ]),
      ),
      "git.path": "/Applications/Xcode.app/Contents/Developer/usr/bin/git",
    };
  }

  readonly Uri = { parse: (value: string) => new FakeUri(value) };

  readonly Range = FakeRange;

  readonly ColorThemeKind = { Light: 1, HighContrast: 3, HighContrastLight: 4 };

  readonly workspace = {
    getConfiguration: (section: string) => ({
      get: <T>(key: string): T | undefined => this.setting<T>(section, key),
    }),
    onDidChangeConfiguration: this.configurationChanged.subscribe,
  };

  readonly window = {
    createTextEditorDecorationType: (options: { gutterIconPath: unknown }) =>
      new FakeDecorationType((options.gutterIconPath as FakeUri).value),
    activeColorTheme: this.activeColorTheme(),
    onDidChangeVisibleTextEditors: this.visibleEditorsChanged.subscribe,
    onDidChangeActiveColorTheme: this.colorThemeChanged.subscribe,
    createOutputChannel: () => ({
      debug: () => {},
      error: () => {},
      dispose: () => {},
    }),
  };

  showing(files: string[]): Promise<void> {
    return this.visibleEditorsChanged.fire(
      files.map((fsPath) => ({ document: { uri: { fsPath } } })),
    );
  }

  get extensions(): VscodeThemeApi["extensions"] {
    return { all: this.loadedExtensions };
  }

  private activeColorTheme(): { readonly kind: number } {
    const kindOf = () => this.activeKind();
    return {
      get kind(): number {
        return kindOf();
      },
    };
  }

  tokenColours(): TokenColour[] {
    return this.loadedTokens;
  }

  private activeKind(): number {
    const uiTheme = this.activeTheme()?.theme.uiTheme ?? "vs-dark";
    return KINDS[uiTheme] ?? KINDS["vs-dark"]!;
  }

  private activeTheme():
    { extensionPath: string; theme: ThemeContribution } | undefined {
    const active = this.setting<string>("workbench", "colorTheme");
    for (const { extensionPath, packageJSON } of this.loadedExtensions) {
      for (const theme of (packageJSON as PackageJson).contributes?.themes ??
        []) {
        if ((theme.id ?? theme.label) === active) {
          return { extensionPath, theme };
        }
      }
    }
    return undefined;
  }

  async reload(): Promise<void> {
    const before = this.loadedSettings;
    const themeBefore = this.activeTheme();
    await this.read();
    const after = this.loadedSettings;
    const changed = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].filter((name) => !isDeepStrictEqual(before[name], after[name]));
    if (changed.length > 0) {
      await this.configurationChanged.fire({
        affectsConfiguration: (section) =>
          changed.some(
            (name) => name === section || name.startsWith(`${section}.`),
          ),
      });
    }
    if (!isDeepStrictEqual(themeBefore, this.activeTheme())) {
      await this.colorThemeChanged.fire();
    }
  }

  private async read(): Promise<void> {
    this.loadedSettings = await this.readSettings();
    this.loadedExtensions = await this.readInstalled();
    this.loadedTokens = await this.readTokens();
  }

  private async readInstalled(): Promise<Extension[]> {
    let entries: DirEntry[];
    try {
      entries = await this.fs.promises.readdir(this.extensionsDir, {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const names = entries.map((entry) => String(entry.name)).sort();
    return Promise.all(
      names.map(async (name) => {
        const extensionPath = path.join(this.extensionsDir, name);
        return {
          extensionPath,
          packageJSON: JSON.parse(
            new TextDecoder().decode(
              await this.fs.promises.readFile(
                path.join(extensionPath, "package.json"),
              ),
            ),
          ) as unknown,
        };
      }),
    );
  }

  private async readTokens(): Promise<TokenColour[]> {
    const active = this.activeTheme();
    if (active === undefined) {
      return [];
    }
    return this.tokensIn(
      path.join(active.extensionPath, active.theme.path ?? ""),
      new Set(),
    );
  }

  private async tokensIn(
    file: string,
    read: Set<string>,
  ): Promise<TokenColour[]> {
    if (read.has(file)) {
      return [];
    }
    read.add(file);
    const theme = JSON.parse(
      new TextDecoder().decode(await this.fs.promises.readFile(file)),
    ) as ThemeFile;
    let included: TokenColour[] = [];
    if (theme.include !== undefined) {
      included = await this.tokensIn(
        path.join(path.dirname(file), theme.include),
        read,
      );
    }
    return [...included, ...(theme.tokenColors ?? [])];
  }

  private setting<T>(section: string, key: string): T | undefined {
    const name = `${section}.${key}`;
    return (
      name in this.loadedSettings
        ? this.loadedSettings[name]
        : this.defaults[name]
    ) as T | undefined;
  }

  private async readSettings(): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(
        new TextDecoder().decode(
          await this.fs.promises.readFile(this.settingsFile),
        ),
      ) as Record<string, unknown>;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }
}
