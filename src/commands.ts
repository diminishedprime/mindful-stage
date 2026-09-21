import { inject, injectable } from "tsyringe";
import {
  COMMAND_REGISTRY,
  LOGGER,
  NAVIGATION,
  REPO_PICKER,
  REPOS,
  STAGING,
  TALLY,
} from "./di-tokens";
import { Logger } from "./logger";
import { Navigation } from "./navigation";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { GitStager } from "./staging";
import { Tally } from "./tally";
import { type CommandRegistry, Direction, GitTrackedMode } from "./types";

@injectable()
export class Commands {
  constructor(
    @inject(NAVIGATION) private readonly navigation: Navigation,
    @inject(REPO_PICKER) private readonly repoPicker: RepoPicker,
    @inject(REPOS) private readonly repos: Repos,
    @inject(STAGING) private readonly staging: GitStager,
    @inject(TALLY) private readonly tally: Tally,
    @inject(COMMAND_REGISTRY) private readonly registry: CommandRegistry,
    @inject(LOGGER) private readonly logger: Logger,
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
  }

  private on(name: string, run: () => Promise<void>): void {
    this.registry.register(name, async () => {
      this.logger.commandStarted(name);
      try {
        await run();
        this.logger.commandLanded(name);
      } catch (error) {
        this.logger.commandThrew(name, error);
        throw error;
      }
    });
  }

  nextUnstaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, GitTrackedMode.Unstaged);
  }

  prevUnstaged(): Promise<void> {
    return this.navigation.jumpFile(
      Direction.Previous,
      GitTrackedMode.Unstaged,
    );
  }

  nextStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, GitTrackedMode.Staged);
  }

  prevStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Previous, GitTrackedMode.Staged);
  }

  nextUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, GitTrackedMode.Unstaged);
  }

  prevUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(
      Direction.Previous,
      GitTrackedMode.Unstaged,
    );
  }

  nextStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, GitTrackedMode.Staged);
  }

  prevStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Previous, GitTrackedMode.Staged);
  }

  nextStagedRepo(): Promise<void> {
    return this.navigation.jumpRepo(Direction.Next);
  }

  prevStagedRepo(): Promise<void> {
    return this.navigation.jumpRepo(Direction.Previous);
  }

  repeatLast(): Promise<void> {
    return this.navigation.repeat();
  }

  pickRepo(): Promise<void> {
    return this.repoPicker.pick();
  }

  stageHunkAtCursor(): Promise<void> {
    return this.staging.stageHunkAtCursor();
  }

  startTracking(): Promise<void> {
    return this.staging.startTracking();
  }

  ready(): Promise<void> {
    return this.repos.ready();
  }

  async dispose(): Promise<void> {
    this.navigation.dispose();
    await this.tally.dispose();
    await this.repos.dispose();
  }
}
