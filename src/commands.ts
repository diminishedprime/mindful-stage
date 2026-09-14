import { inject, injectable } from "tsyringe";
import { NAVIGATION, REPO_PICKER, REPOS, STAGING, TALLY } from "./di-tokens";
import { Navigation } from "./navigation";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { Staging } from "./staging";
import { Tally } from "./tally";
import { Direction, Mode } from "./types";

@injectable()
export class Commands {
  constructor(
    @inject(NAVIGATION) private readonly navigation: Navigation,
    @inject(REPO_PICKER) private readonly repoPicker: RepoPicker,
    @inject(REPOS) private readonly repos: Repos,
    @inject(STAGING) private readonly staging: Staging,
    @inject(TALLY) private readonly tally: Tally,
  ) {}

  nextUnstaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, Mode.Unstaged);
  }

  prevUnstaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Previous, Mode.Unstaged);
  }

  nextStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Next, Mode.Staged);
  }

  prevStaged(): Promise<void> {
    return this.navigation.jumpFile(Direction.Previous, Mode.Staged);
  }

  nextUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, Mode.Unstaged);
  }

  prevUnstagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Previous, Mode.Unstaged);
  }

  nextStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Next, Mode.Staged);
  }

  prevStagedHunk(): Promise<void> {
    return this.navigation.jumpHunk(Direction.Previous, Mode.Staged);
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
