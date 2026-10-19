import * as path from "path";
import { inject, injectable } from "tsyringe";
import { EDITOR, NOTIFIER, REPOS, WORKSPACE } from "./di-tokens";
import { NothingToDo } from "./errors";
import { Repos } from "./repos";
import { Workspace } from "./workspace";
import {
  type Cursor,
  type Destination,
  Direction,
  DestinationKind,
  type Editor,
  type FileDestination,
  GitTrackedMode,
  type Notifier,
  type RepoDestination,
  type Route,
} from "./types";

@injectable()
export class Navigation {
  private aborter = new AbortController();
  private remembered: Route | undefined;

  private static toFile(file: string): FileDestination {
    return { kind: DestinationKind.File, file, line: 1 };
  }

  static toRepo(repo: string): RepoDestination {
    return { kind: DestinationKind.Repo, repo };
  }

  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(NOTIFIER) private readonly notifier: Notifier,
    @inject(REPOS) private readonly repos: Repos,
    @inject(WORKSPACE) private readonly workspace: Workspace,
  ) {}

  jumpFile(direction: Direction, mode: GitTrackedMode): Promise<void> {
    return this.jump({
      plan: (workspace) =>
        workspace.stepFile(this.editor.active(), direction, mode),
      otherwise: () => this.reportNothingLeft(mode),
      mode,
    });
  }

  jumpHunk(direction: Direction, mode: GitTrackedMode): Promise<void> {
    return this.jump({
      plan: (workspace) =>
        workspace.stepHunk(this.editor.active(), direction, mode),
      otherwise: () => this.reportNothingLeft(mode),
      mode,
    });
  }

  jumpRepo(direction: Direction): Promise<void> {
    return this.jump({
      plan: (workspace) => workspace.stepRepo(this.editor.active(), direction),
      otherwise: () => this.reportNothingLeft(GitTrackedMode.Staged),
      mode: GitTrackedMode.Staged,
    });
  }

  async repeat(): Promise<void> {
    if (this.remembered === undefined) {
      throw new NothingToDo("nothing to repeat yet");
    }
    return this.navigate(this.remembered);
  }

  async navigate({ plan, otherwise, mode }: Route): Promise<void> {
    const currentNavigation = this.supersedeNavigation();
    const workspace = this.workspace;
    const destination = await plan(workspace);
    if (currentNavigation.aborted) {
      return;
    }
    if (destination === undefined) {
      await otherwise?.();
      return;
    }
    await this.navigateTo(destination, mode);
  }

  // Stryker disable all: disposal is not observable through the test fakes
  dispose(): void {
    this.aborter.abort();
  }
  // Stryker restore all

  private jump(route: Route): Promise<void> {
    this.remembered = route;
    return this.navigate(route);
  }

  private async reportNothingLeft(mode: GitTrackedMode): Promise<void> {
    this.notifier.notify(`no ${mode} files`);
  }

  private supersedeNavigation(): AbortSignal {
    this.aborter.abort();
    this.aborter = new AbortController();
    return this.aborter.signal;
  }

  private async navigateTo(
    destination: Destination,
    mode: GitTrackedMode | undefined,
  ): Promise<void> {
    const { file, line } =
      destination.kind === DestinationKind.Repo
        ? await this.repoLandingPlace(destination.repo)
        : destination;
    const from = this.editor.active();
    await this.editor.open(file, line);
    await this.announceRepoCrossing(from, file);
    await this.hintIfUntracked(file);
    if (mode !== undefined) {
      await this.explainFallback(file, mode);
    }
  }

  private async explainFallback(
    file: string,
    mode: GitTrackedMode,
  ): Promise<void> {
    const repo = this.repos.repoContaining(file);
    const { fallback, unopenable } = await repo.status.value();
    const count = unopenable[mode];
    if (file !== fallback || count === 0) {
      return;
    }
    this.notifier.error(
      `${count} ${mode} ${count === 1 ? "file" : "files"} in ${path.basename(repo.path)} can't be opened, opening ${path.basename(fallback)} instead.`,
    );
  }

  private async repoLandingPlace(repo: string): Promise<FileDestination> {
    const changes = await this.repos.byPath(repo).status.value();
    const file =
      changes.stops[GitTrackedMode.Unstaged].first(Direction.Next) ??
      changes.stops[GitTrackedMode.Staged].first(Direction.Next) ??
      changes.fallback;
    if (file === undefined) {
      throw new NothingToDo(`nothing can be opened in ${path.basename(repo)}`);
    }
    return Navigation.toFile(file);
  }

  private async hintIfUntracked(file: string): Promise<void> {
    const changes = await this.repos.repoContaining(file).status.value();
    if (changes.untracked.has(file)) {
      this.notifier.notify("untracked file, use start tracking to stage it");
    }
  }

  private async announceRepoCrossing(from: Cursor, to: string): Promise<void> {
    if (from.kind === "nowhere") {
      return;
    }
    const repo = this.repos.repoContaining(to);
    if (this.repos.findRepoContaining(from.at.path) !== repo) {
      this.notifier.notify(`now in ${path.basename(repo.path)}`);
    }
  }
}
