import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { simpleGit } from "simple-git";
import { OutOfBand } from ".";
import { FakeVscode } from "../fakes/vscode";

export class RealOutOfBand extends OutOfBand {
  private static readonly GLOBAL_EXCLUDES = ".gitignore_global";

  static async create(fixtures: boolean): Promise<RealOutOfBand> {
    const root = await RealOutOfBand.setupPolyrepoRoot();
    await fs.writeFile(
      path.join(root, RealOutOfBand.GLOBAL_EXCLUDES),
      "*.swp\n",
    );
    const workspace = path.join(root, "workspace");
    await fs.mkdir(path.join(workspace, OutOfBand.EMPTY), { recursive: true });
    if (!fixtures) {
      return new RealOutOfBand(root);
    }
    await Promise.all([
      ...Object.entries(OutOfBand.DEFAULT_REPOS).map(([repo, files]) =>
        RealOutOfBand.setupRepo(root, workspace, repo, files),
      ),
      RealOutOfBand.setupRepo(
        root,
        workspace,
        OutOfBand.STANDALONE,
        OutOfBand.STANDALONE_FILES,
      ),
    ]);
    return new RealOutOfBand(root);
  }

  async dispose(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }

  private static async setupPolyrepoRoot(): Promise<string> {
    return fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "mindful-stage-")),
    );
  }

  private static async writeFiles(
    cwd: string,
    files: Record<string, string>,
  ): Promise<void> {
    await Promise.all(
      Object.entries(files).map(async ([file, content]) => {
        await fs.mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
        await fs.writeFile(path.join(cwd, file), content);
      }),
    );
  }

  private static hashObject(cwd: string, content: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["hash-object", "-w", "--stdin"], { cwd });
      let hash = "";
      child.stdout.on("data", (chunk) => {
        hash += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(hash.trim());
        } else {
          reject(new Error(`git hash-object exited with ${code}`));
        }
      });
      child.stdin.end(content);
    });
  }

  private static async setupRepo(
    root: string,
    workspace: string,
    repo: string,
    files: Record<string, string>,
  ) {
    const cwd = path.join(workspace, repo);
    await RealOutOfBand.writeFiles(cwd, files);
    const git = simpleGit(cwd);
    await git.init();
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "test");
    await RealOutOfBand.excludeGlobally(root, cwd);
    await git.add(".");
    await git.commit("init");
    await RealOutOfBand.setUpstream(cwd);
  }

  private static async excludeGlobally(
    root: string,
    cwd: string,
  ): Promise<void> {
    await simpleGit(cwd).addConfig(
      "core.excludesFile",
      path.join(root, RealOutOfBand.GLOBAL_EXCLUDES),
    );
  }

  private static async setUpstream(cwd: string): Promise<void> {
    const git = simpleGit(cwd);
    const branch = (await git.raw("symbolic-ref", "--short", "HEAD")).trim();
    await git.addConfig("remote.origin.url", `${path.basename(cwd)}.origin`);
    await git.addConfig(
      "remote.origin.fetch",
      "+refs/heads/*:refs/remotes/origin/*",
    );
    await git.addConfig(`branch.${branch}.remote`, "origin");
    await git.addConfig(`branch.${branch}.merge`, `refs/heads/${branch}`);
    await git.raw("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  }

  override async commitStaged(repo: string): Promise<void> {
    const cwd = this.repoPath(repo);
    const git = simpleGit(cwd);
    const branch = await this.change(async () => {
      const branch = (await git.raw("symbolic-ref", "--short", "HEAD")).trim();
      await git.commit("staged work");
      return branch;
    });
    await this.reactionTo(path.join(cwd, ".git", "refs", "heads", branch));
  }

  override async push(repo: string): Promise<void> {
    const cwd = this.repoPath(repo);
    const git = simpleGit(cwd);
    const branch = await this.change(async () => {
      const branch = (await git.raw("symbolic-ref", "--short", "HEAD")).trim();
      await git.raw("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
      return branch;
    });
    await this.reactionTo(
      path.join(cwd, ".git", "refs", "remotes", "origin", branch),
    );
  }

  override async modifyTrackedFile(file: string): Promise<void> {
    await fs.appendFile(
      this.pathTo(file),
      file.endsWith(".png") ? Buffer.from([0x00]) : "edited\n",
    );
    await this.reactionTo(this.pathTo(file));
  }

  override async modifyTrackedFiles(files: string[]): Promise<void> {
    await Promise.all(
      files.map((file) => fs.appendFile(this.pathTo(file), "edited\n")),
    );
    await Promise.all(files.map((file) => this.reactionTo(this.pathTo(file))));
  }

  override async modifyTrackedLine(file: string, line: number): Promise<void> {
    const lines = (await fs.readFile(this.pathTo(file), "utf8")).split("\n");
    lines[line - 1] = `${lines[line - 1]} edited`;
    await fs.writeFile(this.pathTo(file), lines.join("\n"));
    await this.reactionTo(this.pathTo(file));
  }

  protected override async writeSetting(
    name: string,
    value: unknown,
  ): Promise<void> {
    const file = path.join(this.root, ".vscode", "settings.json");
    const settings = await RealOutOfBand.readSettings(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      `${JSON.stringify({ ...settings, [name]: value }, null, 2)}\n`,
    );
  }

  private static async readSettings(
    file: string,
  ): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as Record<
        string,
        unknown
      >;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  protected override writeTheme(
    name: string,
    uiTheme: string,
    tokenColors: unknown[],
  ): Promise<void> {
    return this.writeThemeExtension(
      name,
      { id: name, label: RealOutOfBand.titled(name), uiTheme },
      { name, tokenColors },
    );
  }

  private async writeThemeExtension(
    name: string,
    theme: { id?: string; label: string; uiTheme: string },
    file: object,
  ): Promise<void> {
    await RealOutOfBand.writeFiles(
      path.join(this.root, FakeVscode.EXTENSIONS, name),
      {
        "package.json": RealOutOfBand.json({
          name,
          contributes: {
            themes: [{ ...theme, path: "./themes/theme.json" }],
          },
        }),
        "themes/theme.json": RealOutOfBand.json(file),
      },
    );
  }

  protected override async writeDefaultThemes(): Promise<void> {
    const vendored = path.join(__dirname, "..", "vendor", "vscode", "themes");
    const themes = [
      { id: "Dark Modern", label: "Dark Modern", file: "dark_modern.json" },
      { id: "Dark+", label: "Dark+", file: "dark_plus.json" },
      {
        id: "Visual Studio Dark",
        label: "Dark (Visual Studio)",
        file: "dark_vs.json",
      },
    ];
    const files = Object.fromEntries(
      await Promise.all(
        themes.map(async ({ file }) => [
          `themes/${file}`,
          await fs.readFile(path.join(vendored, file), "utf8"),
        ]),
      ),
    ) as Record<string, string>;
    await RealOutOfBand.writeFiles(
      path.join(this.root, FakeVscode.EXTENSIONS, "theme-defaults"),
      {
        ...files,
        "package.json": RealOutOfBand.json({
          name: "theme-defaults",
          contributes: {
            themes: themes.map(({ id, label, file }) => ({
              id,
              label,
              uiTheme: "vs-dark",
              path: `./themes/${file}`,
            })),
          },
        }),
      },
    );
  }

  private static json(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private static titled(name: string): string {
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  override async createRepo(
    repo: string,
    files: Record<string, string>,
  ): Promise<void> {
    const appeared = this.reactionTo(path.join(this.repoPath(repo), ".git"));
    await this.change(() =>
      RealOutOfBand.setupRepo(this.root, this.workspace, repo, files),
    );
    this.repos.add(repo);
    await appeared;
  }

  override async initRepo(
    repo: string,
    files: Record<string, string>,
  ): Promise<void> {
    const cwd = this.repoPath(repo);
    await RealOutOfBand.writeFiles(cwd, files);
    const appeared = this.reactionTo(path.join(cwd, ".git"));
    await this.change(async () => {
      await simpleGit(cwd).init();
      await RealOutOfBand.excludeGlobally(this.root, cwd);
    });
    this.repos.add(repo);
    await appeared;
  }

  override async removeRepo(repo: string): Promise<void> {
    await fs.rm(this.repoPath(repo), { recursive: true, force: true });
    this.repos.delete(repo);
    await this.reactionTo(this.repoPath(repo));
  }

  override async removeGitDir(repo: string): Promise<void> {
    const gitDir = path.join(this.repoPath(repo), ".git");
    await fs.rm(gitDir, { recursive: true, force: true });
    this.repos.delete(repo);
    await this.reactionTo(gitDir);
  }

  protected override writeBrokenTheme(name: string): Promise<void> {
    return this.writeThemeExtension(
      name,
      { label: name, uiTheme: "vs-dark" },
      { name, tokenColors: ["not a token colour"] },
    );
  }

  protected override writeCircularTheme(name: string): Promise<void> {
    return this.writeThemeExtension(
      name,
      { label: name, uiTheme: "vs-dark" },
      { name, include: "./theme.json" },
    );
  }

  protected override async writeSaved(
    file: string,
    content: string,
  ): Promise<void> {
    await fs.writeFile(this.pathTo(file), content);
    await this.reactionTo(this.pathTo(file));
  }

  override async touchFolder(dir: string): Promise<void> {
    const touched = this.pathTo(dir);
    const reaction = this.reactionTo(touched);
    const now = new Date();
    await fs.utimes(touched, now, now);
    await reaction;
  }

  override async createScratchFile(file: string): Promise<void> {
    await RealOutOfBand.writeFiles(this.workspace, { [file]: "scratch\n" });
  }

  override async writeGitInternal(
    repo: string,
    file: string,
    content: string,
  ): Promise<void> {
    const internal = path.join(this.repoPath(repo), ".git", file);
    await RealOutOfBand.writeFiles(path.join(this.repoPath(repo), ".git"), {
      [file]: content,
    });
    await this.reactionTo(internal);
  }

  override async writeObject(repo: string, content: string): Promise<void> {
    const hash = await RealOutOfBand.hashObject(this.repoPath(repo), content);
    await this.reactionTo(
      path.join(
        this.repoPath(repo),
        ".git",
        "objects",
        hash.slice(0, 2),
        hash.slice(2),
      ),
    );
  }

  override async appendLine(file: string, line: string): Promise<void> {
    await fs.appendFile(this.pathTo(file), `${line}\n`);
    await this.reactionTo(this.pathTo(file));
  }

  override async deleteLines(
    file: string,
    from: number,
    count: number,
  ): Promise<void> {
    const lines = (await fs.readFile(this.pathTo(file), "utf8")).split("\n");
    lines.splice(from - 1, count);
    await fs.writeFile(this.pathTo(file), lines.join("\n"));
    await this.reactionTo(this.pathTo(file));
  }

  override async insertLines(
    file: string,
    after: number,
    count: number,
  ): Promise<void> {
    const lines = (await fs.readFile(this.pathTo(file), "utf8")).split("\n");
    lines.splice(
      after,
      0,
      ...Array.from({ length: count }, (_, i) => `inserted ${i + 1}`),
    );
    await fs.writeFile(this.pathTo(file), lines.join("\n"));
    await this.reactionTo(this.pathTo(file));
  }

  override async stageFile(file: string): Promise<void> {
    const repo = [...this.repos].find((r) => file.startsWith(`${r}/`))!;
    await this.change(() =>
      simpleGit(this.repoPath(repo)).add(path.relative(repo, file)),
    );
    await this.reactionTo(path.join(this.repoPath(repo), ".git", "index"));
  }

  override async deleteTrackedFile(file: string): Promise<void> {
    await fs.rm(this.pathTo(file));
    await this.reactionTo(this.pathTo(file));
  }

  override async createOneLineFile(repo: string, file: string): Promise<void> {
    await fs.writeFile(path.join(this.repoPath(repo), file), "one line");
    await this.reactionTo(path.join(this.repoPath(repo), file));
  }

  override async createUntrackedFile(
    repo: string,
    file: string,
    lines = 1,
  ): Promise<void> {
    await fs.writeFile(
      path.join(this.repoPath(repo), file),
      Array.from({ length: lines }, (_, i) => `new ${i + 1}\n`).join(""),
    );
    await this.reactionTo(path.join(this.repoPath(repo), file));
  }
}
