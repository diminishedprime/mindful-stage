import type parseDiff from "parse-diff";
import type { StatusResult } from "simple-git";
import type { Repo } from "./repos/repo";
import type { Ring } from "./ring";
import type { Workspace } from "./workspace";

export type Position = { path: string; line: number };

export type AtCursor = { active: Position; repo: Repo };

export enum DestinationKind {
  Hunk,
  File,
  Repo,
}

export type HunkDestination = {
  kind: DestinationKind.Hunk;
  file: string;
  line: number;
};

export type FileDestination = { kind: DestinationKind.File; file: string };

export type RepoDestination = { kind: DestinationKind.Repo; repo: string };

export type ResolvedDestination = HunkDestination | FileDestination;

export type Destination = ResolvedDestination | RepoDestination;

export type Route = {
  plan: (workspace: Workspace) => Promise<Destination | undefined>;
  otherwise?: (workspace: Workspace) => Promise<void>;
};

export enum Direction {
  Next,
  Previous,
}

export interface Disposable {
  dispose(): Promise<void>;
}

export type Hunk = {
  start: number;
  count: number;
  from: string;
  to: string;
  chunk: parseDiff.Chunk;
};

export interface Git extends Disposable {
  status(repo: string): Promise<StatusResult>;
  lfsPaths(repo: string, paths: string[]): Promise<Set<string>>;
  hunks(repo: string, file: string, mode: Mode): Promise<Diff>;
  stage(repo: string, hunk: Hunk): Promise<void>;
  trackedFiles(repo: string): Promise<string[]>;
  hashObject(repo: string, content: string): Promise<string>;
  addToIndex(repo: string, file: string, hash: string): Promise<void>;
}

export interface RepoFinder extends Disposable {
  findReposUnderWorkspace(workspaceRoot: string): Promise<string[]>;
}

export enum Mode {
  Unstaged = "unstaged",
  Staged = "staged",
}

export enum StatusCode {
  Added = "A",
  Copied = "C",
  Deleted = "D",
  Modified = "M",
  Renamed = "R",
  TypeChanged = "T",
  Unmerged = "U",
  Untracked = "?",
}

export type Changes = Record<Mode, Ring<string>> & {
  untracked: Set<string>;
  deleted: Set<string>;
  remaining: Partial<Record<StatusCode, number>>;
  ahead: number;
  upstream: boolean;
};

export type Diff = Ring<Hunk, number>;

export type OnChange = (path: string) => Promise<void>;

export type WorkspaceListener = {
  gitDirectoryChanged(gitDir: string): Promise<void>;
  gitInternalsChanged(file: string): Promise<void>;
  workingTreeChanged(file: string): Promise<void>;
};

export interface Watcher {
  watch(root: string, onChange: OnChange): Promise<Disposable>;
}

export interface Editor {
  active(): Position | undefined;
  open(path: string, line?: number): Promise<void>;
}

export interface GitRefresher {
  refresh(repo: string): void;
}

export interface StatusBar extends Disposable {
  show(summary: string, detail: string): void;
}

export type Choice = { label: string; detail: string; repo: string };

export interface Picker {
  pick(choices: Choice[]): Promise<Choice | undefined>;
}

export interface Notifier {
  notify(message: string): void;
  error(message: string): void;
}

export enum Counted {
  UnpushedCommits,
  MissingUpstream,
}

export enum Labelled {
  ReadyToCommit,
  NoLocalChanges,
}

export type Style = {
  counted: Record<Counted, (count: number) => string>;
  labelled: Record<Labelled, string>;
};

export type RepoListener = {
  refreshed(repo: string, changes: Changes): void;
  removed(repo: string): void;
};
