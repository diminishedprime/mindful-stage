import { inject, injectable } from "tsyringe";
import { Commands } from "./commands";
import { COMMANDS, FILE_BADGES, GUTTERS, REPOS, TALLY } from "./di-tokens";
import { FileBadges } from "./display/file-badges";
import { Gutters } from "./display/gutters";
import { Repos } from "./repos";
import { Tally } from "./tally";

@injectable()
export class App {
  constructor(
    @inject(COMMANDS) private readonly commands: Commands,
    @inject(GUTTERS) private readonly gutters: Gutters,
    @inject(REPOS) private readonly repos: Repos,
    @inject(TALLY) private readonly tally: Tally,
    @inject(FILE_BADGES) _fileBadges: FileBadges,
  ) {}

  async start(): Promise<void> {
    await this.tally.initializing(this.standUp());
  }

  private async standUp(): Promise<void> {
    await this.repos.start();
    await this.gutters.start();
    this.commands.register();
  }
}
