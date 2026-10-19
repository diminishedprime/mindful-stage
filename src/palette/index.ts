import * as path from "path";
import { parse } from "jsonc-parser";
import { inject, injectable } from "tsyringe";
import { FS, SETTINGS, THEME } from "../di-tokens";
import { contributedDefaults } from "../templates/contributed-colours.ts" with { type: "macro" };
import {
  CustomizationsSchema,
  type Fs,
  type PaletteKey,
  SCOPES,
  type Settings,
  type Theme,
  ThemeFileSchema,
  type TokenColor,
} from "../types";

const DEFAULTS = contributedDefaults();

export type Colours = Record<PaletteKey, string>;

const PALETTE_KEYS = Object.keys(SCOPES) as PaletteKey[];

@injectable()
export class Palette {
  constructor(
    @inject(FS) private readonly fs: Fs,
    @inject(SETTINGS) private readonly settings: Settings,
    @inject(THEME) private readonly theme: Theme,
  ) {}

  async colours(): Promise<Colours> {
    const active = this.settings.colorTheme();
    const { colours, byTheme } = CustomizationsSchema.parse(
      this.settings.colorCustomizations(),
    );
    const customized = { ...colours, ...byTheme[active] };
    const tokens = await this.tokensFor(active);
    const variant = this.theme.variant();
    return Object.fromEntries(
      PALETTE_KEYS.map((key) => [
        key,
        customized[this.colorId(key)] ??
          Palette.fromScope(tokens, SCOPES[key]) ??
          DEFAULTS[key][variant],
      ]),
    ) as Colours;
  }

  colorId(key: PaletteKey): string {
    return `mindfulStage.${key}`;
  }

  private async tokensFor(active: string): Promise<TokenColor[]> {
    try {
      return await this.tokensOf(active);
    } catch (error) {
      throw new Error(
        `couldn't read the ${active} theme because ${(error as Error).message}, mindful stage won't work until it's fixed`,
      );
    }
  }

  private static fromScope(
    tokens: TokenColor[],
    wanted: string,
  ): string | undefined {
    return (
      Palette.matching(tokens, (scope) => scope === wanted) ??
      Palette.matching(tokens, (scope) => scope.startsWith(`${wanted}.`))
    );
  }

  private static matching(
    tokens: TokenColor[],
    hit: (scope: string) => boolean,
  ): string | undefined {
    let found: string | undefined;
    for (const token of tokens) {
      const foreground = token.settings.foreground;
      if (typeof foreground === "string" && Palette.scopesOf(token).some(hit)) {
        found = foreground;
      }
    }
    return found;
  }

  private static scopesOf(token: TokenColor): string[] {
    return [token.scope]
      .flat()
      .flatMap((scope) => scope.split(","))
      .map((scope) => scope.trim());
  }

  private async tokensOf(active: string): Promise<TokenColor[]> {
    for (const theme of this.theme.installed()) {
      if ((theme.id ?? theme.label) === active) {
        return this.tokensIn(theme.file);
      }
    }
    return [];
  }

  private async tokensIn(
    file: string,
    read = new Set<string>(),
  ): Promise<TokenColor[]> {
    if (read.has(file)) {
      throw new Error(`${path.basename(file)} includes itself`);
    }
    read.add(file);
    const parsed = ThemeFileSchema.safeParse(await this.read(file));
    if (!parsed.success) {
      throw new Error(`${path.basename(file)} isn't a valid theme file`);
    }
    const theme = parsed.data;
    let included: TokenColor[] = [];
    if (theme.include !== undefined) {
      included = await this.tokensIn(
        path.join(path.dirname(file), theme.include),
        read,
      );
    }
    return [...included, ...(theme.tokenColors ?? [])];
  }

  private async read(file: string): Promise<unknown> {
    return parse(
      new TextDecoder().decode(await this.fs.promises.readFile(file)),
    );
  }
}
