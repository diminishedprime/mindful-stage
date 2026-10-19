import * as path from "path";
import { inject, injectable } from "tsyringe";
import { VSCODE } from "../di-tokens";
import { type Theme, type ThemeEntry, Variant } from "../types";

type Contributed = { id?: string; label?: string; path: string };

export type VscodeThemeApi = {
  window: { activeColorTheme: { kind: number } };
  ColorThemeKind: {
    Light: number;
    HighContrast: number;
    HighContrastLight: number;
  };
  extensions: {
    all: readonly { extensionPath: string; packageJSON: unknown }[];
  };
};

@injectable()
export class VscodeTheme implements Theme {
  constructor(@inject(VSCODE) private readonly vscode: VscodeThemeApi) {}

  variant(): Variant {
    switch (this.vscode.window.activeColorTheme.kind) {
      case this.vscode.ColorThemeKind.Light:
        return Variant.Light;
      case this.vscode.ColorThemeKind.HighContrast:
        return Variant.HighContrast;
      case this.vscode.ColorThemeKind.HighContrastLight:
        return Variant.HighContrastLight;
      default:
        return Variant.Dark;
    }
  }

  installed(): ThemeEntry[] {
    const entries: ThemeEntry[] = [];
    for (const extension of this.vscode.extensions.all) {
      const themes =
        (extension.packageJSON as { contributes?: { themes?: Contributed[] } })
          ?.contributes?.themes ?? [];
      for (const theme of themes) {
        entries.push({
          id: theme.id,
          label: theme.label,
          file: path.join(extension.extensionPath, theme.path),
        });
      }
    }
    return entries;
  }
}
