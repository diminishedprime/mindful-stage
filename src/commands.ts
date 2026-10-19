import { inject, injectable } from "tsyringe";
import {
  COMMAND_REGISTRY,
  LOGGER,
  NAVIGATION,
  NOTIFIER,
  REPO_PICKER,
  REPOS,
  STAGING,
  STATUS_BAR,
} from "./di-tokens";
import { NothingToDo } from "./errors";
import { Logger } from "./logger";
import { Navigation } from "./navigation";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { GitStager } from "./staging";
import {
  type CommandRegistry,
  Direction,
  GitTrackedMode,
  type Notifier,
  type StatusBar,
} from "./types";

@injectable()
export class Commands {
  constructor(
    @inject(NAVIGATION) private readonly navigation: Navigation,
    @inject(REPO_PICKER) private readonly repoPicker: RepoPicker,
    @inject(REPOS) private readonly repos: Repos,
    @inject(STAGING) private readonly staging: GitStager,
    @inject(COMMAND_REGISTRY) private readonly registry: CommandRegistry,
    @inject(STATUS_BAR) private readonly statusBar: StatusBar,
    @inject(LOGGER) private readonly logger: Logger,
    @inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  register(): void {
    this.on("nextUnstaged", () => this.nextUnstaged());
    this.on("prevUnstaged", () => this.prevUnstaged());
    this.on("nextStaged", () => this.nextStaged());
    this.on("prevStaged", () => this.prevStaged());
    this.on("nextUnstagedHunk", () => this.nextUnstagedHunk());
    this.on("prevUnstagedHunk", () => this.prevUnstagedHunk());
    this.on("nextStagedHunk", () => this.nextStagedHunk());
    this.on("prevStagedHunk", () => this.prevStagedHunk());
    this.on("nextStagedRepo", () => this.nextStagedRepo());
    this.on("prevStagedRepo", () => this.prevStagedRepo());
    this.on("repeatLast", () => this.repeatLast());
    this.on("pickRepo", () => this.pickRepo());
    this.on("stageHunkAtCursor", () => this.stageHunkAtCursor());
    this.on("startTracking", () => this.startTracking());
    this.statusBar.whenClicked("pickRepo");
  }

  private on(name: string, run: () => Promise<void>): void {
    this.registry.register(name, async () => {
      this.logger.commandStarted(name);
      try {
        await run();
      } catch (error) {
        if (error instanceof NothingToDo) {
          this.notifier.notify(error.message);
        } else {
          this.logger.commandThrew(name, error);
          throw error;
        }
      }
      this.logger.commandLanded(name);
    });
  }

  private nextUnstaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, GitTrackedMode.Unstaged);
  }

  private prevUnstaged(): Promise<void> {
    return this.navigation.jumpFile(
      Direction.Previous,
      GitTrackedMode.Unstaged,
    );
  }

  private nextStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, GitTrackedMode.Staged);
  }

  private prevStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Previous, GitTrackedMode.Staged);
  }

  private nextUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, GitTrackedMode.Unstaged);
  }

  private prevUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(
      Direction.Previous,
      GitTrackedMode.Unstaged,
    );
  }

  private nextStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, GitTrackedMode.Staged);
  }

  private prevStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Previous, GitTrackedMode.Staged);
  }

  private nextStagedRepo(): Promise<void> {
    return this.navigation.jumpRepo(Direction.Next);
  }

  private prevStagedRepo(): Promise<void> {
    return this.navigation.jumpRepo(Direction.Previous);
  }

  private repeatLast(): Promise<void> {
    return this.navigation.repeat();
  }

  private pickRepo(): Promise<void> {
    return this.repoPicker.pick();
  }

  private stageHunkAtCursor(): Promise<void> {
    return this.staging.stageHunkAtCursor();
  }

  private startTracking(): Promise<void> {
    return this.staging.startTracking();
  }

  ready(): Promise<void> {
    return this.repos.ready();
  }
}
