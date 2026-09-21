import { inject, injectable } from "tsyringe";
import {
  COMPOSITOR,
  DECORATIONS,
  EDITOR,
  EVENTS,
  LOGGER,
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

  private onScreen: string[] = [];

  constructor(
    @inject(DECORATIONS) private readonly decorations: Decorations,
    @inject(EDITOR) private readonly editor: Editor,
    @inject(COMPOSITOR) private readonly compositor: Compositor,
    @inject(REPOS) private readonly repos: Repos,
    @inject(LOGGER) private readonly logger: Logger,
    @inject(SETTINGS) private readonly settings: Settings,
    @inject(EVENTS) events: Events,
  ) {
    repos.subscribe(this);
    events.visibleFilesChanged((files) => this.showing(files));
    events.colorsChanged(() => this.repaint());
    events.decorationsToggled(() => this.toggled());
    this.repaint();
  }

  private toggled(): void {
    if (!this.settings.decorationsEnabled()) {
      this.clear(this.onScreen);
      return;
    }
    this.render(this.onScreen);
  }

  private repaint(): void {
    this.decorations
      .recolor()
      .then(() => this.showing(this.editor.visibleFiles()))
      .catch((error: unknown) => this.logger.failed("recolor", error));
  }

  showing(files: string[]): void {
    this.onScreen = files;
    this.render(files);
  }

  refreshed(repo: string): void {
    this.render(
      this.onScreen.filter(
        (file) => this.repos.findRepoContaining(file)?.path === repo,
      ),
    );
  }

  removed(): void {
    this.render(this.onScreen);
  }

  private render(files: string[]): void {
    this.paint(files).catch((error: unknown) =>
      this.logger.failed("gutter render", error),
    );
  }

  private async paint(files: string[]): Promise<void> {
    if (!this.settings.decorationsEnabled()) {
      return;
    }
    await this.repos.discovered();
    for (const file of files) {
      const lineCount = this.editor.numberOfLines(file);
      if (lineCount === 0) {
        continue;
      }
      this.decorations.render(
        file,
        this.compositor.compose(await this.marksFor(file), lineCount),
      );
    }
  }

  private clear(files: string[]): void {
    for (const file of files) {
      this.decorations.render(file, []);
    }
  }

  private async marksFor(file: string): Promise<Marks> {
    const repo = this.repos.findRepoContaining(file);
    if (repo === undefined) {
      return Gutters.NOTHING;
    }
    const changes = await repo.status.value();
    if (changes.untracked.has(file)) {
      return { ...Gutters.NOTHING, [UNTRACKED]: this.wholeFile(file) };
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

  private wholeFile(file: string): Span[] {
    const lines = this.editor.numberOfLines(file);
    if (lines === 0) {
      return [];
    }
    return [{ start: 1, count: lines }];
  }

  private static spans(hunks: Diff): Span[] {
    const spans: Span[] = [];
    for (const hunk of hunks.all(Direction.Next)) {
      spans.push({ start: hunk.start, count: hunk.count });
    }
    return spans;
  }
}
