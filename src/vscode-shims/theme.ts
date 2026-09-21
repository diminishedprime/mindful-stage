import * as path from "path";
import * as vscode from "vscode";
import { type Theme, type ThemeEntry, Variant } from "../types";

type Contributed = { id?: string; label?: string; path: string };

export class VscodeTheme implements Theme {
  variant(): Variant {
    switch (vscode.window.activeColorTheme.kind) {
      case vscode.ColorThemeKind.Light:
        return Variant.Light;
      case vscode.ColorThemeKind.HighContrast:
        return Variant.HighContrast;
      case vscode.ColorThemeKind.HighContrastLight:
        return Variant.HighContrastLight;
      default:
        return Variant.Dark;
    }
  }

  installed(): ThemeEntry[] {
    const entries: ThemeEntry[] = [];
    for (const extension of vscode.extensions.all) {
      const themes: Contributed[] =
        extension.packageJSON?.contributes?.themes ?? [];
      for (const theme of themes) {
        entries.push({
          id: theme.id,
          label: theme.label,
          file: path.join(extension.extensionPath, theme.path),
          nls: path.join(extension.extensionPath, "package.nls.json"),
        });
      }
    }
    return entries;
  }
}
