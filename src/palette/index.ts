import * as fs from "fs/promises";
import * as path from "path";
import { parse } from "jsonc-parser";
import { inject, injectable } from "tsyringe";
import { MANIFEST, SETTINGS, THEME } from "../di-tokens";
import {
  CustomizationsSchema,
  type Customizations,
  NlsSchema,
  type NlsEntry,
  type PaletteKey,
  SCOPES,
  type Settings,
  type Theme,
  type ThemeEntry,
  ThemeFileSchema,
  type TokenColor,
} from "../types";
import { Manifest } from "./manifest";

@injectable()
export class Palette {
  private customized: Record<string, string> = {};
  private tokens: TokenColor[] = [];

  constructor(
    @inject(MANIFEST) private readonly manifest: Manifest,
    @inject(SETTINGS) private readonly settings: Settings,
    @inject(THEME) private readonly theme: Theme,
  ) {
    this.requireContributed();
  }

  async reload(): Promise<void> {
    const active = this.settings.colorTheme();
    this.customized = this.flattened(
      CustomizationsSchema.parse(this.settings.colorCustomizations()),
      active,
    );
    this.tokens = await this.tokensOf(active);
  }

  colorId(key: PaletteKey): string {
    return `mindfulStage.${key}`;
  }

  resolve(key: PaletteKey): string {
    const id = this.colorId(key);
    return (
      this.customized[id] ?? this.fromScope(SCOPES[key]) ?? this.contributed(id)
    );
  }

  private requireContributed(): void {
    const missing = (Object.keys(SCOPES) as PaletteKey[])
      .map((key) => this.colorId(key))
      .filter((id) => this.manifest.defaultsFor(id) === undefined);
    if (missing.length > 0) {
      throw new Error(
        `package.json contributes.colors is missing ${missing.join(", ")}`,
      );
    }
  }

  private contributed(id: string): string {
    const defaults = this.manifest.defaultsFor(id);
    if (defaults === undefined) {
      throw new Error(`no contributed colour for ${id}`);
    }
    return defaults[this.theme.variant()];
  }

  private fromScope(wanted: string): string | undefined {
    return (
      this.matching((scope) => scope === wanted) ??
      this.matching((scope) => scope.startsWith(`${wanted}.`))
    );
  }

  private matching(hit: (scope: string) => boolean): string | undefined {
    let found: string | undefined;
    for (const token of this.tokens) {
      const foreground = token.settings?.foreground;
      if (typeof foreground === "string" && this.scopesOf(token).some(hit)) {
        found = foreground;
      }
    }
    return found;
  }

  private scopesOf(token: TokenColor): string[] {
    if (typeof token.scope === "string") {
      return token.scope.split(",").map((scope) => scope.trim());
    }
    if (token.scope === undefined) {
      return [];
    }
    return token.scope;
  }

  private async tokensOf(active: string): Promise<TokenColor[]> {
    for (const theme of this.theme.installed()) {
      if (await this.isNamed(theme, active)) {
        return this.tokensIn(theme.file);
      }
    }
    return [];
  }

  private async isNamed(theme: ThemeEntry, active: string): Promise<boolean> {
    if (theme.id === active || theme.label === active) {
      return true;
    }
    if (!theme.label?.startsWith("%") || !theme.label.endsWith("%")) {
      return false;
    }
    const strings = NlsSchema.parse(await this.read(theme.nls));
    return this.named(strings[theme.label.slice(1, -1)]) === active;
  }

  private async tokensIn(file: string, depth = 10): Promise<TokenColor[]> {
    if (depth === 0) {
      return [];
    }
    const theme = ThemeFileSchema.parse(await this.read(file));
    let included: TokenColor[] = [];
    if (theme.include !== undefined) {
      included = await this.tokensIn(
        path.join(path.dirname(file), theme.include),
        depth - 1,
      );
    }
    return [...included, ...(theme.tokenColors ?? [])];
  }

  private async read(file: string): Promise<unknown> {
    return parse(await fs.readFile(file, "utf8"));
  }

  private flattened(
    customizations: Customizations,
    active: string,
  ): Record<string, string> {
    const flattened: Record<string, string> = {};
    for (const [id, value] of Object.entries(customizations)) {
      if (typeof value === "string") {
        flattened[id] = value;
      }
    }
    return { ...flattened, ...this.forTheme(customizations, active) };
  }

  private forTheme(
    customizations: Customizations,
    active: string,
  ): Record<string, string> {
    const themed = customizations[`[${active}]`];
    if (themed === undefined || typeof themed === "string") {
      return {};
    }
    return themed;
  }

  private named(entry: NlsEntry | undefined): string {
    if (entry === undefined) {
      return "";
    }
    if (typeof entry === "string") {
      return entry;
    }
    return entry.message;
  }
}
