import { inject, injectable } from "tsyringe";
import { EDITOR, VSCODE } from "./di-tokens";
import type { Disposable, Editor } from "./types";

type LogChannel = {
  debug(message: string): void;
  error(message: string): void;
  dispose(): void;
};

export type VscodeLogApi = {
  window: {
    createOutputChannel(name: string, options: { log: true }): LogChannel;
  };
};

@injectable()
export class Logger implements Disposable {
  private readonly channel: LogChannel;

  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(VSCODE) vscode: VscodeLogApi,
  ) {
    this.channel = vscode.window.createOutputChannel("Mindful Stage", {
      log: true,
    });
  }

  async dispose(): Promise<void> {
    this.channel.dispose();
  }

  commandStarted(name: string): void {
    this.channel.debug(`${name} from ${this.activeCursor()}`);
  }

  commandLanded(name: string): void {
    this.channel.debug(`${name} landed on ${this.activeCursor()}`);
  }

  commandThrew(name: string, error: unknown): void {
    this.channel.error(`${name} threw ${Logger.describe(error)}`);
  }

  failed(activity: string, error: unknown): void {
    this.channel.error(`${activity} failed ${Logger.describe(error)}`);
  }

  private static describe(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }
    return error.stack ?? error.message;
  }

  private activeCursor(): string {
    const cursor = this.editor.active();
    return cursor.kind === "nowhere"
      ? "no active editor"
      : `${cursor.at.path}:${cursor.at.line}`;
  }
}
