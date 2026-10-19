import * as path from "path";
import type { FakeEditor } from "../fakes/editor";
import type { Recorded } from "../recording";

type Configuration = { reload(): Promise<void> };
type Reactions = { settled(): Promise<void> };
type Changes = { track(work: Promise<unknown>): void };

export abstract class OutOfBand {
  static readonly FIRST_REPO = "k3s/infra/argo";
  static readonly ARGO_YAML = `${OutOfBand.FIRST_REPO}/argo.yaml`;
  static readonly ARGO_VALUES = `${OutOfBand.FIRST_REPO}/values.yaml`;

  static readonly SECOND_REPO = "lab/util/mindful-stage";
  static readonly MINDFUL_STAGE_README = `${OutOfBand.SECOND_REPO}/README.md`;
  static readonly MINDFUL_STAGE_INDEX = `${OutOfBand.SECOND_REPO}/src/index.ts`;
  static readonly MINDFUL_STAGE_ICON = `${OutOfBand.SECOND_REPO}/icon.png`;

  static readonly STANDALONE = "../standalone";
  static readonly EMPTY = "../empty";
  static readonly STANDALONE_MAIN = `${OutOfBand.STANDALONE}/main.ts`;

  static readonly THIRD_REPO = "lab/util/parallel-lab";
  static readonly PARALLEL_LAB_MAIN = `${OutOfBand.THIRD_REPO}/lab.ts`;

  protected static readonly DEFAULT_REPOS = {
    [OutOfBand.FIRST_REPO]: {
      ".gitignore": "*.log\ntarget/\nnode_modules/\n",
      "node_modules/dep/index.js": "module.exports = {};\n",
      "argo.yaml": "kind: Namespace\nmetadata:\n  name: argo\n",
      "kustomization.yaml": "resources:\n  - argo.yaml\n",
      "values.yaml": Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}\n`,
      ).join(""),
    },
    [OutOfBand.SECOND_REPO]: {
      LICENSE: "MIT\n",
      "README.md": Array.from({ length: 12 }, (_, i) => `line ${i + 1}\n`).join(
        "",
      ),
      "icon.png": "\u0000png\n",
      "src/index.ts": Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}\n`,
      ).join(""),
    },
    [OutOfBand.THIRD_REPO]: {
      "README.md": "parallel lab\n",
      "lab.ts": Array.from({ length: 12 }, (_, i) => `line ${i + 1}\n`).join(
        "",
      ),
    },
  };

  protected static readonly STANDALONE_FILES = {
    "main.ts": Array.from({ length: 12 }, (_, i) => `line ${i + 1}\n`).join(""),
  };

  protected readonly repos = new Set([
    ...Object.keys(OutOfBand.DEFAULT_REPOS),
    OutOfBand.STANDALONE,
  ]);
  private readonly pending: Promise<unknown>[] = [];
  private watcher: { nextReaction(path: string): Promise<void> } | undefined;
  private editor: FakeEditor | undefined;
  private configuration: Configuration | undefined;
  private reactions: Reactions | undefined;
  private changes: Changes | undefined;

  protected constructor(readonly root: string) {}

  get replayed(): Recorded {
    throw new Error("only a replayed polyrepo has a recording");
  }

  followApp(_key: string): void {
    throw new Error("only a replayed polyrepo follows the app's changes");
  }

  commitStaged(repo: string): Promise<void> {
    return this.follow("commitStaged", [repo]);
  }

  push(repo: string): Promise<void> {
    return this.follow("push", [repo]);
  }

  modifyTrackedFile(file: string): Promise<void> {
    return this.follow("modifyTrackedFile", [file]);
  }

  modifyTrackedFiles(files: string[]): Promise<void> {
    return this.follow("modifyTrackedFiles", [files]);
  }

  modifyTrackedLine(file: string, line: number): Promise<void> {
    return this.follow("modifyTrackedLine", [file, line]);
  }

  async changeSetting(name: string, value: unknown): Promise<void> {
    await this.writeSetting(name, value);
    await this.reconfigured();
  }

  async installTheme(
    name: string,
    uiTheme: string,
    tokenColors: unknown[],
  ): Promise<void> {
    await this.writeTheme(name, uiTheme, tokenColors);
    await this.reconfigured();
  }

  protected writeTheme(
    name: string,
    uiTheme: string,
    tokenColors: unknown[],
  ): Promise<void> {
    return this.follow("installTheme", [name, uiTheme, tokenColors]);
  }

  async installBrokenTheme(name: string): Promise<void> {
    await this.writeBrokenTheme(name);
    await this.reconfigured();
  }

  protected writeBrokenTheme(name: string): Promise<void> {
    return this.follow("installBrokenTheme", [name]);
  }

  async installCircularTheme(name: string): Promise<void> {
    await this.writeCircularTheme(name);
    await this.reconfigured();
  }

  protected writeCircularTheme(name: string): Promise<void> {
    return this.follow("installCircularTheme", [name]);
  }

  async installDefaultThemes(): Promise<void> {
    await this.writeDefaultThemes();
    await this.reconfigured();
  }

  protected writeDefaultThemes(): Promise<void> {
    return this.follow("installDefaultThemes", []);
  }

  private async reconfigured(): Promise<void> {
    await this.configuration?.reload();
    await this.reactions?.settled();
  }

  protected writeSetting(name: string, value: unknown): Promise<void> {
    return this.follow("changeSetting", [name, value]);
  }

  createRepo(repo: string, files: Record<string, string>): Promise<void> {
    return this.follow("createRepo", [repo, files]);
  }

  initRepo(repo: string, files: Record<string, string>): Promise<void> {
    return this.follow("initRepo", [repo, files]);
  }

  removeRepo(repo: string): Promise<void> {
    return this.follow("removeRepo", [repo]);
  }

  removeGitDir(repo: string): Promise<void> {
    return this.follow("removeGitDir", [repo]);
  }

  async deleteLinesWithoutSaving(
    file: string,
    from: number,
    count: number,
  ): Promise<void> {
    await this.editor!.deleteLinesWithoutSaving(this.pathTo(file), from, count);
  }

  async save(file: string): Promise<void> {
    await this.writeSaved(file, this.editor!.save(this.pathTo(file)));
  }

  protected writeSaved(file: string, _content: string): Promise<void> {
    return this.follow("save", [file]);
  }

  touchFolder(dir: string): Promise<void> {
    return this.follow("touchFolder", [dir]);
  }

  createScratchFile(file: string): Promise<void> {
    return this.follow("createScratchFile", [file]);
  }

  writeGitInternal(repo: string, file: string, content: string): Promise<void> {
    return this.follow("writeGitInternal", [repo, file, content]);
  }

  writeObject(repo: string, content: string): Promise<void> {
    return this.follow("writeObject", [repo, content]);
  }

  appendLine(file: string, line: string): Promise<void> {
    return this.follow("appendLine", [file, line]);
  }

  deleteLines(file: string, from: number, count: number): Promise<void> {
    return this.follow("deleteLines", [file, from, count]);
  }

  insertLines(file: string, after: number, count: number): Promise<void> {
    return this.follow("insertLines", [file, after, count]);
  }

  stageFile(file: string): Promise<void> {
    return this.follow("stageFile", [file]);
  }

  deleteTrackedFile(file: string): Promise<void> {
    return this.follow("deleteTrackedFile", [file]);
  }

  createOneLineFile(repo: string, file: string): Promise<void> {
    return this.follow("createOneLineFile", [repo, file]);
  }
  createUntrackedFile(
    ...args: [repo: string, file: string, lines?: number]
  ): Promise<void> {
    return this.follow("createUntrackedFile", args);
  }

  recordChanges(changes: Changes): void {
    this.changes = changes;
  }

  protected change<T>(mutate: () => Promise<T>): Promise<T> {
    const work = mutate();
    this.changes?.track(work);
    return work;
  }

  protected follow(method: string, _args: unknown[]): Promise<void> {
    return Promise.reject(
      new Error(`${method} has no behavior in this polyrepo`),
    );
  }

  abstract dispose(): Promise<void>;

  attach(
    watcher: { nextReaction(path: string): Promise<void> },
    editor?: FakeEditor,
    configuration?: Configuration,
    reactions?: Reactions,
  ): void {
    this.watcher = watcher;
    this.editor = editor;
    this.configuration = configuration;
    this.reactions = reactions;
  }

  async open(file: string, line?: number): Promise<void> {
    if (this.editor === undefined) {
      throw new Error("no editor is attached to open files in");
    }
    await this.editor.open(this.pathTo(file), line ?? 1);
    await this.reactions?.settled();
  }

  async reactionTo(path: string): Promise<void> {
    await this.watcher?.nextReaction(path);
    await this.reactions?.settled();
  }

  awaitLater(reaction: Promise<unknown>): void {
    this.pending.push(reaction);
  }

  async settled(): Promise<void> {
    while (this.pending.length > 0) {
      await Promise.all(this.pending.splice(0));
    }
  }

  get workspace(): string {
    return path.join(this.root, "workspace");
  }

  get workspaceFolders(): string[] {
    return [this.workspace, this.pathTo(OutOfBand.STANDALONE)];
  }

  repoPath(repo: string): string {
    return path.join(this.workspace, repo);
  }

  pathTo(file: string): string {
    return path.join(this.workspace, file);
  }
}
