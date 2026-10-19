import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import pLimit from "p-limit";
import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { inject, injectable } from "tsyringe";
import { SETTINGS } from "./di-tokens";
import { type GitCommands, GitTrackedMode, type Settings } from "./types";

@injectable()
export class SimpleGitCommands implements GitCommands {
  private static readonly CONCURRENCY = 8;

  private readonly aborter = new AbortController();
  private readonly limit = pLimit(SimpleGitCommands.CONCURRENCY);
  private resolvedBinary: Promise<string> | undefined;

  constructor(@inject(SETTINGS) private readonly settings: Settings) {}

  status(repo: string): Promise<StatusResult> {
    return this.limit(async () => (await this.git(repo)).status());
  }

  diff(repo: string, file: string, mode: GitTrackedMode): Promise<string> {
    return this.limit(async () =>
      (await this.git(repo)).diff([
        "-U0",
        ...(mode === GitTrackedMode.Staged ? ["--cached"] : []),
        "--",
        file,
      ]),
    );
  }

  lsFiles(repo: string): Promise<string> {
    return this.limit(async () => (await this.git(repo)).raw("ls-files", "-z"));
  }

  async applyToIndex(repo: string, patch: string): Promise<void> {
    await this.withStdin(repo, ["apply", "--cached", "--unidiff-zero"], patch);
  }

  hashObject(repo: string, content: string): Promise<string> {
    return this.withStdin(repo, ["hash-object", "-w", "--stdin"], content);
  }

  async updateIndex(repo: string, file: string, hash: string): Promise<void> {
    await this.limit(async () =>
      (await this.git(repo)).raw(
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${hash},${file}`,
      ),
    );
  }

  excludesFile(repo: string): Promise<string> {
    return this.limit(async () =>
      (await this.git(repo)).raw(
        "config",
        "--default",
        "",
        "--path",
        "--get",
        "core.excludesFile",
      ),
    );
  }

  async dispose(): Promise<void> {
    this.aborter.abort();
  }

  private withStdin(
    repo: string,
    args: string[],
    input: string,
  ): Promise<string> {
    return this.limit(async () =>
      this.spawned(await this.binary(), repo, args, input),
    );
  }

  private spawned(
    binary: string,
    repo: string,
    args: string[],
    input: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ["--no-optional-locks", ...args], {
        cwd: repo,
        signal: this.aborter.signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(stderr.trim())),
      );
      child.stdin.end(input);
    });
  }

  private async git(repo: string): Promise<SimpleGit> {
    return simpleGit({
      baseDir: repo,
      binary: [await this.binary(), "--no-optional-locks"],
      abort: this.aborter.signal,
    });
  }

  private binary(): Promise<string> {
    this.resolvedBinary ??= SimpleGitCommands.firstExecutable([
      ...this.settings.gitPaths(),
      ...process.env
        .PATH!.split(path.delimiter)
        .map((dir) => path.join(dir, "git")),
    ]);
    return this.resolvedBinary;
  }

  private static async firstExecutable(candidates: string[]): Promise<string> {
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    return "git";
  }
}
