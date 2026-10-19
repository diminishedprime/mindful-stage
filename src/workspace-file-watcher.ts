import * as path from "path";
import { inject, injectable } from "tsyringe";
import { GITIGNORES, WORKSPACE_FOLDERS, WATCHER } from "./di-tokens";
import { Gitignores } from "./gitignores";
import type {
  Disposable,
  FileEvent,
  Watcher,
  WorkspaceListener,
} from "./types";

@injectable()
export class WorkspaceFileWatcher {
  private static readonly GIT_DIR = `${path.sep}.git${path.sep}`;
  private static readonly INFO_EXCLUDE = path.join("info", "exclude");
  private static readonly STATUS_AFFECTING_INTERNALS = [
    ["index"],
    ["HEAD"],
    ["config"],
    ["packed-refs"],
    ["refs"],
    ["info", "exclude"],
  ];

  constructor(
    @inject(GITIGNORES) private readonly gitignore: Gitignores,
    @inject(WATCHER) private readonly watcher: Watcher,
    @inject(WORKSPACE_FOLDERS) private readonly workspaceFolders: string[],
  ) {}

  watch(listener: WorkspaceListener): Promise<Disposable[]> {
    return Promise.all(
      this.workspaceFolders.map((workspaceFolder) =>
        this.watcher.watch(workspaceFolder, (changed, event) =>
          this.relayFileChange(changed, event, listener),
        ),
      ),
    );
  }

  private async relayFileChange(
    changedFile: string,
    event: FileEvent,
    listener: WorkspaceListener,
  ): Promise<void> {
    if (WorkspaceFileWatcher.isDotGit(changedFile)) {
      if (event === "deleted") {
        return listener.gitDirectoryDeleted(changedFile);
      }
      return listener.gitDirectoryAdded(changedFile);
    }

    if (
      WorkspaceFileWatcher.insideDotGitFolder(changedFile) &&
      WorkspaceFileWatcher.doesNotAffectStatus(changedFile)
    ) {
      return;
    }

    if (WorkspaceFileWatcher.isGitIgnoreFile(changedFile)) {
      this.gitignore.clearCache();
    }

    if (event === "deleted") {
      await listener.pathDeleted(changedFile);
    }

    if (WorkspaceFileWatcher.insideDotGitFolder(changedFile)) {
      return listener.gitInternalsChanged(changedFile);
    }

    if (await this.gitignore.ignores(changedFile)) {
      return;
    }

    return listener.workingTreeChanged(changedFile);
  }

  private static doesNotAffectStatus(gitInternal: string): boolean {
    const segments = gitInternal.split(path.sep);
    const inside = segments.slice(segments.lastIndexOf(".git") + 1);
    return !WorkspaceFileWatcher.STATUS_AFFECTING_INTERNALS.some((prefix) =>
      prefix.every((segment, index) => inside[index] === segment),
    );
  }

  private static isDotGit(file: string): boolean {
    return path.basename(file) === ".git";
  }

  private static insideDotGitFolder(file: string): boolean {
    return file.includes(WorkspaceFileWatcher.GIT_DIR);
  }

  private static isGitIgnoreFile(file: string): boolean {
    return (
      path.basename(file) === ".gitignore" ||
      file.endsWith(
        `${WorkspaceFileWatcher.GIT_DIR}${WorkspaceFileWatcher.INFO_EXCLUDE}`,
      )
    );
  }
}
