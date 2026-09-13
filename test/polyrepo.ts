import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { simpleGit } from "simple-git";

export class Polyrepo {
  static readonly ARGO = "k3s/infra/argo";
  static readonly ARGO_YAML = `${Polyrepo.ARGO}/argo.yaml`;
  static readonly ARGO_KUSTOMIZATION = `${Polyrepo.ARGO}/kustomization.yaml`;

  static readonly MINDFUL_STAGE = "lab/util/mindful-stage";
  static readonly MINDFUL_STAGE_README = `${Polyrepo.MINDFUL_STAGE}/README.md`;
  static readonly MINDFUL_STAGE_INDEX = `${Polyrepo.MINDFUL_STAGE}/src/index.ts`;

  static readonly CERT_MANAGER = "k3s/networking/cert-manager";
  static readonly CERT_MANAGER_KUSTOMIZATION = `${Polyrepo.CERT_MANAGER}/kustomization.yaml`;

  private static readonly DEFAULT_REPOS = {
    [Polyrepo.ARGO]: {
      ".gitignore": "*.log\n",
      "argo.yaml": "kind: Namespace\nmetadata:\n  name: argo\n",
      "kustomization.yaml": "resources:\n  - argo.yaml\n",
    },
    [Polyrepo.MINDFUL_STAGE]: {
      "README.md": Array.from({ length: 12 }, (_, i) => `line ${i + 1}\n`).join(
        "",
      ),
      "src/index.ts": Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}\n`,
      ).join(""),
    },
  };

  private readonly repos = new Set(Object.keys(Polyrepo.DEFAULT_REPOS));
  private watcher: { nextReaction(path: string): Promise<void> } | undefined;

  private constructor(readonly root: string) {}

  attach(watcher: { nextReaction(path: string): Promise<void> }): void {
    this.watcher = watcher;
  }

  private reactionTo(path: string): Promise<void> {
    return this.watcher?.nextReaction(path) ?? Promise.resolve();
  }

  static async create(): Promise<Polyrepo> {
    const root = this.setupPolyrepoRoot();
    await Promise.all(
      Object.entries(Polyrepo.DEFAULT_REPOS).map(([repo, files]) =>
        this.setupRepo(root, repo, files),
      ),
    );
    return new Polyrepo(root);
  }

  async cloneRepo(repo: string, files: Record<string, string>): Promise<void> {
    const seen = this.reactionTo(path.join(this.repoPath(repo), ".git"));
    await Polyrepo.setupRepo(this.root, repo, files);
    this.repos.add(repo);
    await seen;
  }

  private static setupPolyrepoRoot() {
    return fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mindful-stage-")),
    );
  }

  private static async setupRepo(
    root: string,
    repo: string,
    files: Record<string, string>,
  ) {
    const cwd = path.join(root, repo);
    fs.mkdirSync(cwd, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), content);
    }
    const git = simpleGit(cwd);
    await git.init();
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "test");
    await git.add(".");
    await git.commit("init");
  }

  repoPath(repo: string): string {
    return path.join(this.root, repo);
  }

  repoPaths(): Set<string> {
    return new Set([...this.repos].map((repo) => this.repoPath(repo)));
  }

  pathTo(file: string): string {
    return path.join(this.root, file);
  }

  async modifyTrackedFile(file: string): Promise<void> {
    const seen = this.reactionTo(this.pathTo(file));
    fs.appendFileSync(
      this.pathTo(file),
      file.endsWith(".png") ? Buffer.from([0x00]) : "edited\n",
    );
    await seen;
  }

  async modifyTrackedLine(file: string, line: number): Promise<void> {
    const seen = this.reactionTo(this.pathTo(file));
    const lines = fs.readFileSync(this.pathTo(file), "utf8").split("\n");
    lines[line - 1] = `${lines[line - 1]} edited`;
    fs.writeFileSync(this.pathTo(file), lines.join("\n"));
    await seen;
  }

  async trackWithLfs(
    repo: string,
    pattern: string,
    file: string,
  ): Promise<void> {
    const git = simpleGit(this.repoPath(repo));
    await git.raw("lfs", "install", "--local");
    await git.raw("lfs", "track", pattern);
    const seen = this.reactionTo(path.join(this.repoPath(repo), file));
    fs.writeFileSync(
      path.join(this.repoPath(repo), file),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await git.add(".");
    await git.commit("track binary with lfs");
    await seen;
  }

  async stageTrackedLine(file: string, line: number): Promise<void> {
    await this.modifyTrackedLine(file, line);
    await this.stageFile(file);
  }

  async stageTrackedChange(file: string): Promise<void> {
    await this.modifyTrackedFile(file);
    await this.stageFile(file);
  }

  async stageFile(file: string): Promise<void> {
    const repo = [...this.repos].find((r) => file.startsWith(`${r}/`))!;
    const seen = this.reactionTo(path.join(this.repoPath(repo), ".git", "index"));
    await simpleGit(this.repoPath(repo)).add(path.relative(repo, file));
    await seen;
  }

  async deleteTrackedFile(file: string): Promise<void> {
    const seen = this.reactionTo(this.pathTo(file));
    fs.rmSync(this.pathTo(file));
    await seen;
  }

  async createUntrackedFile(repo: string, file: string, lines = 1): Promise<void> {
    const seen = this.reactionTo(path.join(this.repoPath(repo), file));
    fs.writeFileSync(
      path.join(this.repoPath(repo), file),
      Array.from({ length: lines }, (_, i) => `new ${i + 1}\n`).join(""),
    );
    await seen;
  }

  async createUntrackedBinaryFile(repo: string, file: string): Promise<void> {
    const seen = this.reactionTo(path.join(this.repoPath(repo), file));
    fs.writeFileSync(
      path.join(this.repoPath(repo), file),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
    );
    await seen;
  }

  async createGloballyIgnoredFile(repo: string, file: string): Promise<void> {
    const seen = this.reactionTo(path.join(this.repoPath(repo), file));
    fs.writeFileSync(path.join(this.repoPath(repo), file), "local\n");
    const ignored = await simpleGit(this.repoPath(repo)).checkIgnore(file);
    if (ignored.length === 0) {
      throw new Error(`${file} is not ignored by the global git ignore`);
    }
    await seen;
  }

  async createIgnoredFile(repo: string, file: string): Promise<void> {
    const seen = this.reactionTo(path.join(this.repoPath(repo), file));
    fs.writeFileSync(path.join(this.repoPath(repo), file), "ignored\n");
    const ignored = await simpleGit(this.repoPath(repo)).checkIgnore(file);
    if (ignored.length === 0) {
      throw new Error(`${file} is not gitignored`);
    }
    await seen;
  }

  dispose(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
  }
}
