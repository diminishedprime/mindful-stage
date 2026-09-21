import * as fs from "fs";
import * as path from "path";
import { inject, injectable } from "tsyringe";
import { EDITOR, LOG_DIRECTORY, SETTINGS } from "./di-tokens";
import type { Disposable, Editor, Settings } from "./types";

const FILE = "mindful-stage.log";

@injectable()
export class Logger implements Disposable {
  private readonly opening: Promise<fs.WriteStream>;

  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(SETTINGS) private readonly settings: Settings,
    @inject(LOG_DIRECTORY) directory: string,
  ) {
    this.opening = fs.promises
      .mkdir(directory, { recursive: true })
      .then(() =>
        fs.createWriteStream(path.join(directory, FILE), { flags: "a" }),
      );
  }

  async dispose(): Promise<void> {
    const stream = await this.opening;
    await new Promise((resolve) => stream.end(resolve));
  }

  commandStarted(name: string): void {
    this.write(`${name} from ${this.activeCursor()}`);
  }

  commandLanded(name: string): void {
    this.write(`${name} landed on ${this.activeCursor()}`);
  }

  commandThrew(name: string, error: unknown): void {
    this.write(`${name} threw ${Logger.describe(error)}`);
  }

  failed(activity: string, error: unknown): void {
    this.write(`${activity} failed ${Logger.describe(error)}`);
  }

  private static describe(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }
    return error.stack ?? error.message;
  }

  private write(message: string): void {
    if (!this.settings.loggingEnabled()) {
      return;
    }
    const line = `${new Date().toISOString()} ${message}\n`;
    void this.opening.then(
      (stream) => stream.write(line),
      () => undefined,
    );
  }

  private activeCursor(): string {
    const cursor = this.editor.active();
    return cursor.kind === "nowhere"
      ? "no active editor"
      : `${cursor.at.path}:${cursor.at.line}`;
  }
}
