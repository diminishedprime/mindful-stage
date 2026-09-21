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
  statusFor(repo: string): Promise<StatusResult>;
  lfsPathsFor(repo: string, paths: string[]): Promise<Set<string>>;
  hunksFor(repo: string, file: string, mode: GitTrackedMode): Promise<Diff>;
  stage(repo: string, hunk: Hunk): Promise<void>;
  trackedFilesFor(repo: string): Promise<string[]>;
  hashObject(repo: string, content: string): Promise<string>;
  addToIndex(repo: string, file: string, hash: string): Promise<void>;
}

export interface RepoFinder extends Disposable {
  findReposUnderWorkspace(workspaceRoot: string): Promise<string[]>;
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

export type Changes = Record<GitTrackedMode, Ring<string>> & {
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
  active(): Cursor;
  open(path: string, line?: number): Promise<void>;
  visibleFiles(): string[];
  numberOfLines(file: string): number;
}

export interface Events extends Disposable {
  visibleFilesChanged(handler: (files: string[]) => void): void;
  colorsChanged(handler: () => void): void;
  decorationsToggled(handler: () => void): void;
}

export type Span = { start: number; count: number };

export const UNTRACKED = "untracked";

export type MarkKind = GitTrackedMode | typeof UNTRACKED;

export type Marks = Record<MarkKind, Span[]>;

export enum Change {
  Nothing = "nothing",
  Staged = "staged",
  Unstaged = "unstaged",
  Untracked = "untracked",
}

export enum Deletion {
  Nothing = "nothing",
  Staged = "staged",
  Unstaged = "unstaged",
}

export type Mark = {
  change: Change;
  above: Deletion;
  below: Deletion;
};

export type Composition = { mark: Mark; lines: number[] };

export enum Variant {
  Dark = "dark",
  Light = "light",
  HighContrast = "highContrast",
  HighContrastLight = "highContrastLight",
}

export type Defaults = Record<Variant, string>;

export const DefaultsSchema = z.object({
  dark: z.string().min(1),
  light: z.string().min(1),
  highContrast: z.string().min(1),
  highContrastLight: z.string().min(1),
});

export const ManifestSchema = z.object({
  contributes: z.object({
    colors: z
      .array(z.object({ id: z.string().min(1), defaults: DefaultsSchema }))
      .min(1),
  }),
});

export const SCOPES = {
  unstagedChange: "markup.changed",
  stagedChange: "storage",
  unstagedDeletion: "markup.deleted",
  stagedDeletion: "storage",
  untracked: "markup.inserted",
} as const;

export type PaletteKey = keyof typeof SCOPES;

export const TokenColorSchema = z.looseObject({
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  settings: z.looseObject({ foreground: z.string().optional() }).optional(),
});

export type TokenColor = z.infer<typeof TokenColorSchema>;

export const ThemeFileSchema = z.looseObject({
  include: z.string().optional(),
  tokenColors: z.array(TokenColorSchema).optional(),
});

export const CustomizationsSchema = z.record(
  z.string(),
  z.union([z.string(), z.record(z.string(), z.string())]),
);

export type Customizations = z.infer<typeof CustomizationsSchema>;

export const NlsSchema = z.record(
  z.string(),
  z.union([z.string(), z.looseObject({ message: z.string() })]),
);

export type NlsEntry = z.infer<typeof NlsSchema>[string];

export type ThemeEntry = {
  id?: string;
  label?: string;
  file: string;
  nls: string;
};

export interface Theme {
  variant(): Variant;
  installed(): ThemeEntry[];
}

export type FileBadge =
  { kind: "nothing" } | { kind: "badge"; badge: string; color: string };

export const NO_BADGE: FileBadge = { kind: "nothing" };

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
  loggingEnabled(): boolean;
  colorTheme(): string;
  colorCustomizations(): Record<string, unknown>;
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
