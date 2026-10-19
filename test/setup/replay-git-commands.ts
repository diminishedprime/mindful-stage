import type { StatusResult } from "simple-git";
import type { GitCommands, GitTrackedMode } from "../../src/types";
import type { OutOfBand } from "./out-of-band";
import { callKey, rooted } from "./recording";

export class ReplayGitCommands implements GitCommands {
  constructor(private readonly polyrepo: OutOfBand) {}

  async status(repo: string): Promise<StatusResult> {
    return (await this.read("status", [repo])) as StatusResult;
  }

  async diff(
    repo: string,
    file: string,
    mode: GitTrackedMode,
  ): Promise<string> {
    return (await this.read("diff", [repo, file, mode])) as string;
  }

  async lsFiles(repo: string): Promise<string> {
    return (await this.read("lsFiles", [repo])) as string;
  }

  async applyToIndex(repo: string, patch: string): Promise<void> {
    await this.write("applyToIndex", [repo, patch]);
  }

  async hashObject(repo: string, content: string): Promise<string> {
    return (await this.write("hashObject", [repo, content])) as string;
  }

  async updateIndex(repo: string, file: string, hash: string): Promise<void> {
    await this.write("updateIndex", [repo, file, hash]);
  }

  async excludesFile(repo: string): Promise<string> {
    return (await this.read("excludesFile", [repo])) as string;
  }

  async dispose(): Promise<void> {}

  private async read(method: string, args: unknown[]): Promise<unknown> {
    const key = callKey(this.polyrepo.root, method, args);
    const { answers } = this.polyrepo.replayed;
    const answer = answers[key];
    await new Promise((resolve) => setTimeout(resolve, answer?.ms ?? 0));
    if (answer === undefined) {
      throw new Error(`${key} isn't recorded in this state`);
    }
    if ("error" in answer) {
      throw new Error(rooted(this.polyrepo.root, answer.error));
    }
    return rooted(this.polyrepo.root, answer.result);
  }

  private async write(method: string, args: unknown[]): Promise<unknown> {
    const result = await this.read(method, args);
    this.polyrepo.followApp(callKey(this.polyrepo.root, method, args));
    return result;
  }
}
