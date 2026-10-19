import { inject, injectable } from "tsyringe";
import { VSCODE } from "../di-tokens";
import type { Settings } from "../types";

export type VscodeConfiguration = {
  workspace: {
    getConfiguration(section: string): {
      get<T>(key: string): T | undefined;
    };
  };
};

@injectable()
export class VscodeSettings implements Settings {
  constructor(@inject(VSCODE) private readonly vscode: VscodeConfiguration) {}

  decorationsEnabled(): boolean {
    return (
      this.vscode.workspace
        .getConfiguration("mindfulStage")
        .get<boolean>("decorations") ?? true
    );
  }

  colorTheme(): string {
    return (
      this.vscode.workspace
        .getConfiguration("workbench")
        .get<string>("colorTheme") ?? ""
    );
  }

  colorCustomizations(): Record<string, unknown> {
    return (
      this.vscode.workspace
        .getConfiguration("workbench")
        .get<Record<string, unknown>>("colorCustomizations") ?? {}
    );
  }

  gitPaths(): string[] {
    return [
      this.vscode.workspace
        .getConfiguration("git")
        .get<string | string[] | null>("path") ?? [],
    ].flat();
  }
}
