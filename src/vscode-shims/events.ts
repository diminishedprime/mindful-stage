import { inject, injectable } from "tsyringe";
import { VSCODE } from "../di-tokens";
import type { Events } from "../types";

type Subscription = { dispose(): unknown };

type ConfigurationChange = { affectsConfiguration(section: string): boolean };

type VisibleEditor = { document: { uri: { fsPath: string } } };

export type VscodeEventsApi = {
  window: {
    onDidChangeVisibleTextEditors(
      listener: (editors: readonly VisibleEditor[]) => unknown,
    ): Subscription;
    onDidChangeActiveColorTheme(listener: () => unknown): Subscription;
  };
  workspace: {
    onDidChangeConfiguration(
      listener: (event: ConfigurationChange) => unknown,
    ): Subscription;
  };
};

@injectable()
export class VscodeEvents implements Events {
  private readonly subscriptions: Subscription[] = [];

  constructor(@inject(VSCODE) private readonly vscode: VscodeEventsApi) {}

  visibleFilesChanged(handler: (files: string[]) => Promise<void>): void {
    this.subscriptions.push(
      this.vscode.window.onDidChangeVisibleTextEditors((editors) =>
        handler([
          ...new Set(editors.map((editor) => editor.document.uri.fsPath)),
        ]),
      ),
    );
  }

  colorsChanged(handler: () => Promise<void>): void {
    this.subscriptions.push(
      this.vscode.window.onDidChangeActiveColorTheme(() => handler()),
      this.vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration("workbench.colorCustomizations")) {
          await handler();
        }
      }),
    );
  }

  decorationsToggled(handler: () => Promise<void>): void {
    this.subscriptions.push(
      this.vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration("mindfulStage.decorations")) {
          await handler();
        }
      }),
    );
  }

  async dispose(): Promise<void> {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}
