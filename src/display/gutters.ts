import * as path from "path";
import { inject, injectable } from "tsyringe";
import {
  COMPOSITOR,
  DECORATIONS,
  EDITOR,
  EVENTS,
  LOGGER,
  NOTIFIER,
  REPOS,
  SETTINGS,
} from "../di-tokens";
import { Compositor } from "./compositor";
import { Logger } from "../logger";
import { Repos } from "../repos";
import {
  type Decorations,
  type Diff,
  Direction,
  type Editor,
  type Events,
  type Marks,
  GitTrackedMode,
  type Notifier,
  type RepoListener,
  type Settings,
  type Span,
  UNTRACKED,
} from "../types";

@injectable()
export class Gutters implements RepoListener {
  private static readonly NOTHING: Marks = {
    [GitTrackedMode.Unstaged]: [],
    [GitTrackedMode.Staged]: [],
    [UNTRACKED]: [],
  };

  constructor(
    @inject(DECORATIONS) private readonly decorations: Decorations,
    @inject(EDITOR) private readonly editor: Editor,
    @inject(COMPOSITOR) private readonly compositor: Compositor,
    @inject(REPOS) private readonly repos: Repos,
    @inject(LOGGER) private readonly logger: Logger,
    @inject(SETTINGS) private readonly settings: Settings,
    @inject(EVENTS) private readonly events: Events,
    @inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async start(): Promise<void> {
    this.repos.subscribe(this);
    this.events.visibleFilesChanged((files) => this.paint(files));
    this.events.colorsChanged(() => this.repaint());
    this.events.decorationsToggled(() => this.toggled());
    await this.repaint();
  }

  private async toggled(): Promise<void> {
    if (!this.settings.decorationsEnabled()) {
      this.clear(this.editor.visibleFiles());
      return;
    }
    await this.paintVisible();
  }

  private async repaint(): Promise<void> {
    try {
      await this.decorations.recolor();
    } catch (error) {
      this.logger.failed("recolor", error);
      this.notifier.error((error as Error).message);
      return;
    }
    await this.paintVisible();
  }

  refreshed(): Promise<void> {
    return this.paintVisible();
  }

  removed(): Promise<void> {
    return this.paintVisible();
  }

  private paintVisible(): Promise<void> {
    return this.paint(this.editor.visibleFiles());
  }

  private async paint(files: string[]): Promise<void> {
    if (!this.settings.decorationsEnabled()) {
      return;
    }
    for (const file of files) {
      try {
        const lineCount = this.editor.numberOfLines(file);
        this.decorations.render(
          file,
          this.compositor.compose(
            await this.marksFor(file, lineCount),
            lineCount,
          ),
        );
      } catch (error) {
        this.logger.failed(`gutter paint for ${file}`, error);
        this.notifier.error(
          `couldn't draw the gutter for ${path.basename(file)}`,
        );
      }
    }
  }

  private clear(files: string[]): void {
    for (const file of files) {
      this.decorations.render(file, []);
    }
  }

  private async marksFor(file: string, lineCount: number): Promise<Marks> {
    const repo = this.repos.findRepoContaining(file);
    if (repo === undefined) {
      return Gutters.NOTHING;
    }
    const changes = await repo.status.value();
    if (changes.untracked.has(file)) {
      return {
        ...Gutters.NOTHING,
        [UNTRACKED]: [{ start: 1, count: lineCount }],
      };
    }
    return {
      [GitTrackedMode.Unstaged]: Gutters.spans(
        await repo.hunksIn(file, GitTrackedMode.Unstaged),
      ),
      [GitTrackedMode.Staged]: Gutters.spans(
        await repo.hunksIn(file, GitTrackedMode.Staged),
      ),
      [UNTRACKED]: [],
    };
  }

  private static spans(hunks: Diff): Span[] {
    return Array.from(hunks.all(Direction.Next), ({ start, count }) => ({
      start,
      count,
    }));
  }
}
