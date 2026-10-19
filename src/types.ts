import type parseDiff from "parse-diff";
import type { StatusResult } from "simple-git";
import { z } from "zod";
import type { Repo } from "./repos/repo";
import type { Ring } from "./ring";
import type { Workspace } from "./workspace";

export type Position = { path: string; line: number };

export type Cursor = { kind: "nowhere" } | { kind: "somewhere"; at: Position };

export const NOWHERE: Cursor = { kind: "nowhere" };

export type AtCursor = { active: Position; repo: Repo };

export enum DestinationKind {
  File,
  Repo,
}

export type FileDestination = {
  kind: DestinationKind.File;
  file: string;
  line: number;
};

export type RepoDestination = { kind: DestinationKind.Repo; repo: string };

export type Destination = FileDestination | RepoDestination;

export type Route = {
  plan: (workspace: Workspace) => Promise<Destination | undefined>;
  otherwise?: () => Promise<void>;
  mode?: GitTrackedMode;
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

export interface Git {
  statusFor(repo: string): Promise<StatusResult>;
  hunksFor(repo: string, file: string, mode: GitTrackedMode): Promise<Diff>;
  stage(repo: string, hunk: Hunk): Promise<void>;
  trackedFilesFor(repo: string): Promise<string[]>;
  hashObject(repo: string, content: string): Promise<string>;
  addToIndex(repo: string, file: string, hash: string): Promise<void>;
  excludesFileFor(repo: string): Promise<string>;
}

export interface GitCommands extends Disposable {
  status(repo: string): Promise<StatusResult>;
  diff(repo: string, file: string, mode: GitTrackedMode): Promise<string>;
  lsFiles(repo: string): Promise<string>;
  applyToIndex(repo: string, patch: string): Promise<void>;
  hashObject(repo: string, content: string): Promise<string>;
  updateIndex(repo: string, file: string, hash: string): Promise<void>;
  excludesFile(repo: string): Promise<string>;
}

type FileHandle = {
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number; buffer: Uint8Array }>;
  [Symbol.asyncDispose](): PromiseLike<void>;
};

export type DirEntry = { name: string; isDirectory(): boolean };

export interface Fs {
  promises: {
    readFile(path: string): Promise<Uint8Array>;
    open(path: string): Promise<FileHandle>;
    stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
    readdir(
      path: string,
      options: { withFileTypes: true },
    ): Promise<DirEntry[]>;
  };
}

export interface RepoFinder extends Disposable {
  findReposUnderWorkspace(
    workspaceRoot: string,
    found: (repo: string) => Promise<void>,
  ): Promise<void>;
}

export enum GitTrackedMode {
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

export type Changes = Record<GitTrackedMode, readonly string[]> & {
  stops: Record<GitTrackedMode, Ring<string>>;
  unopenable: Record<GitTrackedMode, number>;
  fallback: string | undefined;
  untracked: Set<string>;
  deleted: Set<string>;
  remaining: Partial<Record<StatusCode, number>>;
  ahead: number;
  upstream: boolean;
};

export type Diff = Ring<Hunk, number>;

export type FileEvent = "created" | "changed" | "deleted";

export type OnChange = (path: string, event: FileEvent) => Promise<void>;

export type WorkspaceListener = {
  gitDirectoryAdded(gitDir: string): Promise<void>;
  gitDirectoryDeleted(gitDir: string): Promise<void>;
  gitInternalsChanged(file: string): void;
  workingTreeChanged(file: string): void;
  pathDeleted(deleted: string): Promise<void>;
};

export interface Watcher {
  watch(root: string, onChange: OnChange): Promise<Disposable>;
}

export interface Editor {
  active(): Cursor;
  open(path: string, line: number): Promise<void>;
  visibleFiles(): string[];
  numberOfLines(file: string): number;
  isDirty(file: string): boolean;
}

export interface Events extends Disposable {
  visibleFilesChanged(handler: (files: string[]) => Promise<void>): void;
  colorsChanged(handler: () => Promise<void>): void;
  decorationsToggled(handler: () => Promise<void>): void;
}

export type Span = { start: number; count: number };

export const UNTRACKED = "untracked";

type MarkKind = GitTrackedMode | typeof UNTRACKED;

export type Marks = Record<MarkKind, Span[]>;

export enum Change {
  Nothing = "nothing",
  Staged = "staged",
  Unstaged = "unstaged",
  Untracked = "untracked",
  Deleted = "deleted",
}

export enum Deletion {
  Nothing = "nothing",
  Staged = "staged",
  Unstaged = "unstaged",
}

export type MarkedChange = Change.Staged | Change.Unstaged;

export type Wedge = Deletion.Staged | Deletion.Unstaged;

export type Mark =
  | `${Change.Staged | Change.Unstaged}/${Deletion}/${Deletion}`
  | `${Change.Untracked}/${Deletion.Nothing}/${Deletion.Nothing}`
  | `${Change.Nothing}/${Wedge}/${Deletion}`
  | `${Change.Nothing}/${Deletion.Nothing}/${Wedge}`;

export type Composition = { mark: Mark; lines: number[] };

export enum Variant {
  Dark = "dark",
  Light = "light",
  HighContrast = "highContrast",
  HighContrastLight = "highContrastLight",
}

export type Defaults = Record<Variant, string>;

export const SCOPES = {
  unstagedChange: "markup.changed",
  stagedChange: "storage",
  unstagedDeletion: "markup.deleted",
  stagedDeletion: "storage",
  untracked: "markup.inserted",
} as const;

export type PaletteKey = keyof typeof SCOPES;

const TokenColorSchema = z.looseObject({
  scope: z.union([z.string(), z.array(z.string())]).default([]),
  settings: z.looseObject({ foreground: z.string().optional() }),
});

export type TokenColor = z.infer<typeof TokenColorSchema>;

export const ThemeFileSchema = z.looseObject({
  include: z.string().optional(),
  tokenColors: z.array(TokenColorSchema).optional(),
});

const ColoursSchema = z.record(z.string(), z.string());

export const CustomizationsSchema = z
  .record(z.string(), z.unknown())
  .transform((customizations) => {
    const colours: Record<string, string> = {};
    const byTheme: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(customizations)) {
      if (key.startsWith("[")) {
        byTheme[key.slice(1, -1)] = ColoursSchema.parse(value);
      } else {
        colours[key] = z.string().parse(value);
      }
    }
    return { colours, byTheme };
  });

export type ThemeEntry = {
  id?: string;
  label?: string;
  file: string;
};

export interface Theme {
  variant(): Variant;
  installed(): ThemeEntry[];
}

export type FileBadge = { badge: string; color: string };

export type Badged = Exclude<Change, Change.Nothing>;

export interface FileDecorations extends Disposable {
  decorate(badges: Map<string, FileBadge>): void;
}

export interface Decorations extends Disposable {
  render(file: string, compositions: Composition[]): void;
  recolor(): Promise<void>;
}

export interface CommandRegistry extends Disposable {
  register(name: string, run: () => Promise<void>): void;
}

export interface Settings {
  decorationsEnabled(): boolean;
  colorTheme(): string;
  colorCustomizations(): Record<string, unknown>;
  gitPaths(): string[];
}

export interface StatusBar extends Disposable {
  show(summary: string): void;
  whenClicked(command: string): void;
}

export type Choice = { label: string; description: string; repo: string };

export interface Picker {
  pick(choices: Choice[]): Promise<Choice | undefined>;
}

export interface Notifier {
  notify(message: string): void;
  warn(message: string): void;
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
  refreshed(repo: string, changes: Changes): void | Promise<void>;
  removed(repo: string): void | Promise<void>;
};
