import * as fs from "fs/promises";
import * as path from "path";
import { inject, injectable } from "tsyringe";
import { EDITOR, GIT, NOTIFIER, REPOS, TALLY, WORKSPACE } from "./di-tokens";
import { Repos } from "./repos";
import { Tally } from "./tally";
import { Workspace } from "./workspace";
import {
  type Destination,
  Direction,
  DestinationKind,
  type Editor,
  type FileDestination,
  type ResolvedDestination,
  type Git,
  Mode,
  type Notifier,
  type RepoDestination,
  type Route,
} from "./types";

@injectable()
export class Navigation {
  static readonly COMMON_README_FILENAMES = [
    "readme.md",
    "readme.markdown",
    "readme.rst",
    "readme.org",
    "readme.txt",
    "readme",
  ] as const;

  private aborter = new AbortController();
  private remembered: Route | undefined;

  static toFile(file: string): FileDestination {
    return { kind: DestinationKind.File, file };
  }

  static toRepo(repo: string): RepoDestination {
    return { kind: DestinationKind.Repo, repo };
  }

  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(GIT) private readonly git: Git,
    @inject(NOTIFIER) private readonly notifier: Notifier,
    @inject(REPOS) private readonly repos: Repos,
    @inject(TALLY) private readonly tally: Tally,
    @inject(WORKSPACE) private readonly workspace: Workspace,
  ) {}

  jumpFile(direction: Direction, mode: Mode): Promise<void> {
    return this.jump({
      plan: async (workspace) =>
        Navigation.asFile(
          await workspace.stepFile(this.editor.active()?.path, direction, mode),
        ),
      otherwise: () => this.reportNothingLeft(mode),
    });
  }

  jumpHunk(direction: Direction, mode: Mode): Promise<void> {
    return this.jump({
      plan: (workspace) =>
        workspace.stepHunk(this.editor.active()!, direction, mode),
      otherwise: () => this.reportNothingLeft(mode),
    });
  }

  jumpRepo(direction: Direction): Promise<void> {
    return this.jump({
      plan: async (workspace) =>
        Navigation.asFile(
          await workspace.stepRepo(
            this.editor.active()?.path,
            direction,
            Mode.Staged,
          ),
        ),
      otherwise: async () => this.notifier.notify("no staged files"),
    });
  }

  async repeat(): Promise<void> {
    if (this.remembered === undefined) {
      return;
    }
    return this.navigate(this.remembered);
  }

  async navigate({ plan, otherwise }: Route): Promise<void> {
    const currentNavigation = this.supersedeNavigation();
    await this.repos.primed();
    const workspace = this.workspace;
    const destination = await plan(workspace);
    if (currentNavigation.aborted) {
      return;
    }
    if (destination === undefined) {
      await otherwise?.(workspace);
      return;
    }
    await this.navigateTo(destination);
  }

  dispose(): void {
    this.aborter.abort();
  }

  private jump(route: Route): Promise<void> {
    this.remembered = route;
    return this.navigate(route);
  }

  private async reportNothingLeft(mode: Mode): Promise<void> {
    if (mode === Mode.Unstaged && this.tally.anyStaged()) {
      this.notifier.notify(
        "no remaining unstaged files, use `mindfulStage.nextStagedRepo` to navigate through repos ready to be committed.",
      );
      return;
    }
    this.notifier.notify(`no ${mode} files`);
  }

  private static asFile(file: string | undefined): Destination | undefined {
    if (file === undefined) {
      return undefined;
    }
    return Navigation.toFile(file);
  }

  private supersedeNavigation(): AbortSignal {
    this.aborter.abort();
    this.aborter = new AbortController();
    return this.aborter.signal;
  }

  private async navigateTo(destination: Destination): Promise<void> {
    const resolvedDestination =
      destination.kind === DestinationKind.Repo
        ? await this.repoLandingPlace(destination.repo)
        : destination;
    if (resolvedDestination === undefined) {
      return;
    }
    const from = this.editor.active()?.path;
    await this.open(resolvedDestination);
    await this.announceRepoCrossing(from, resolvedDestination.file);
    await this.hintIfUntracked(resolvedDestination.file);
  }

  private async repoLandingPlace(
    repo: string,
  ): Promise<FileDestination | undefined> {
    const changes = await this.repos.byPath(repo).status.value();
    const file =
      changes[Mode.Unstaged].first(Direction.Next) ??
      changes[Mode.Staged].first(Direction.Next) ??
      (await this.firstOpenableFile(repo));
    if (file === undefined) {
      this.notifier.error(`nothing can be opened in ${path.basename(repo)}`);
      return undefined;
    }
    return Navigation.toFile(file);
  }

  private async open(resolvedDestination: ResolvedDestination): Promise<void> {
    const { file } = resolvedDestination;
    const name = path.basename(file);

    if ((await this.isDeleted(file)) || !(await Navigation.exists(file))) {
      return this.openFallback(
        file,
        `${name} was deleted`,
        "stage the deletion",
      );
    }
    if (await Navigation.isBinary(file)) {
      return this.openFallback(file, `can't open ${name}`, `handle ${name}`);
    }
    if (resolvedDestination.kind === DestinationKind.Hunk) {
      return this.editor.open(file, resolvedDestination.line);
    }
    return this.editor.open(file);
  }

  private async isDeleted(file: string): Promise<boolean> {
    const changes = await this.repos.repoContaining(file).status.value();
    return changes.deleted.has(file);
  }

  private async openFallback(
    target: string,
    problem: string,
    advice: string,
  ): Promise<void> {
    const repo = this.repos.repoContaining(target).path;
    const fallback = await this.firstOpenableFile(repo);
    if (fallback === undefined) {
      this.notifier.error(
        `${problem}, and nothing in ${path.basename(repo)} can be opened instead, so ${advice} manually.`,
      );
      return;
    }
    this.notifier.error(
      `${problem}, opening first tracked file so you can ${advice} manually.`,
    );
    await this.editor.open(fallback);
  }

  private async firstOpenableFile(repo: string): Promise<string | undefined> {
    const tracked = await this.git.trackedFiles(repo);
    const readme = Navigation.findReadme(tracked);
    for (const file of readme === undefined ? tracked : [readme, ...tracked]) {
      const candidate = path.join(repo, file);
      if (await Navigation.isOpenable(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private async hintIfUntracked(file: string): Promise<void> {
    const changes = await this.repos.repoContaining(file).status.value();
    if (changes.untracked.has(file)) {
      this.notifier.notify("untracked file, use start tracking to stage it");
    }
  }

  private async announceRepoCrossing(
    from: string | undefined,
    to: string,
  ): Promise<void> {
    if (from === undefined) {
      return;
    }
    const repo = this.repos.findRepoContaining(to);
    if (this.repos.findRepoContaining(from) !== repo && repo !== undefined) {
      this.notifier.notify(`now in ${path.basename(repo.path)}`);
    }
  }

  private static findReadme(tracked: string[]): string | undefined {
    for (const name of Navigation.COMMON_README_FILENAMES) {
      const match = tracked.find((file) => file.toLowerCase() === name);
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  private static async exists(file: string): Promise<boolean> {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  private static async isOpenable(file: string): Promise<boolean> {
    try {
      return !(await Navigation.isBinary(file));
    } catch {
      return false;
    }
  }

  private static async isBinary(file: string): Promise<boolean> {
    const handle = await fs.open(file);
    try {
      const { bytesRead, buffer } = await handle.read(
        Buffer.alloc(8000),
        0,
        8000,
        0,
      );
      return buffer.subarray(0, bytesRead).includes(0);
    } finally {
      await handle.close();
    }
  }
}
