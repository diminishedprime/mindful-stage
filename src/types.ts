import type parseDiff from "parse-diff";
import type { StatusResult } from "simple-git";

export type Position = { path: string; line: number };

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
  hunks(repo: string, file: string, mode: Mode): Promise<Hunk[]>;
  stage(repo: string, hunk: Hunk): Promise<void>;
  trackedFiles(repo: string): Promise<string[]>;
  hashObject(repo: string, content: string): Promise<string>;
  addToIndex(repo: string, file: string, hash: string): Promise<void>;
}

export interface RepoFinder extends Disposable {
  find(root: string): Promise<string[]>;
}

export enum Mode {
  Unstaged = "unstaged",
  Staged = "staged",
}

export type Changes = Record<Mode, string[]> & {
  untracked: string[];
  deleted: string[];
  remaining: Record<string, number>;
};

export type Tracked = { known?: Changes; pending?: Promise<Changes> };

export type OnChange = (path: string) => Promise<void>;

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
  show(summary: string): void;
}

export interface Notifier {
  notify(message: string): void;
  error(message: string): void;
}
