import * as nodeFs from "fs";
import * as path from "path";
import "reflect-metadata";
import { container } from "tsyringe";
import { App } from "../../src/app";
import { Commands } from "../../src/commands";
import {
  COMMAND_REGISTRY,
  COMMANDS,
  COMPOSITOR,
  DECORATIONS,
  EDITOR,
  EVENTS,
  FILE_BADGES,
  FILE_DECORATIONS,
  FS,
  GIT,
  GITIGNORES,
  GIT_COMMANDS,
  GUTTERS,
  LOGGER,
  NAVIGATION,
  NOTIFIER,
  PALETTE,
  PICKER,
  REPO_FINDER,
  REPO_PICKER,
  REPOS,
  SETTINGS,
  STAGING,
  STATUS_BAR,
  TALLY,
  THEME,
  VSCODE,
  WATCHER,
  WORKSPACE,
  WORKSPACE_FILE_WATCHER,
  WORKSPACE_FOLDERS,
} from "../../src/di-tokens";
import { Compositor } from "../../src/display/compositor";
import { FileBadges } from "../../src/display/file-badges";
import { Gutters } from "../../src/display/gutters";
import { SimpleGitClient } from "../../src/git";
import { Gitignores } from "../../src/gitignores";
import { Logger } from "../../src/logger";
import { Navigation } from "../../src/navigation";
import { Palette } from "../../src/palette";
import { WalkingRepoFinder } from "../../src/repo-finder";
import { RepoPicker } from "../../src/repo-picker";
import { Repos } from "../../src/repos";
import { GitStager } from "../../src/staging";
import { Tally } from "../../src/tally";
import type {
  CommandRegistry,
  Decorations,
  Editor,
  Events,
  FileDecorations,
  Fs,
  Git,
  GitCommands,
  Notifier,
  Picker,
  RepoFinder,
  Settings,
  StatusBar,
  Theme,
  Watcher,
} from "../../src/types";
import { Workspace } from "../../src/workspace";
import { WorkspaceFileWatcher } from "../../src/workspace-file-watcher";
import { FakeCommandRegistry } from "./fakes/command-registry";
import { FakeEditor } from "./fakes/editor";
import { FakeFileDecorations } from "./fakes/file-decorations";
import { FakeNotifier } from "./fakes/notifier";
import { FakePicker } from "./fakes/picker";
import { FakeStatusBar } from "./fakes/status-bar";
import { FakeVscode } from "./fakes/vscode";
import { SettlingWatcher } from "./fakes/watcher";
import { VscodeDecorations } from "../../src/vscode-shims/decorations";
import { VscodeEvents } from "../../src/vscode-shims/events";
import { VscodeSettings } from "../../src/vscode-shims/settings";
import { VscodeTheme } from "../../src/vscode-shims/theme";
import { MemoryFs } from "./memory-fs";
import { ParcelWatcher } from "./parcel-watcher";
import type { OutOfBand } from "./out-of-band";
import { ReplayOutOfBand } from "./out-of-band/replay";
import { type Clock, clocked, RealClock, VirtualClock } from "./clock";
import { Recorder, recordedDriver } from "./recorder";
import { Recordings } from "./recording";
import { CountingFs } from "./counting-fs";
import { Timeline } from "./timeline";
import { CountingGitCommands } from "./counting-git-commands";
import { RecordingGitCommands } from "./recording-git-commands";
import { ReplayGitCommands } from "./replay-git-commands";
import {
  ExplorerView,
  EditorView,
  FilesView,
  GitView,
  GutterColours,
  GutterView,
  MessagesView,
  PickerView,
  StatusBarView,
} from "./views";

type Command =
  | "nextUnstaged"
  | "prevUnstaged"
  | "nextStaged"
  | "prevStaged"
  | "nextUnstagedHunk"
  | "prevUnstagedHunk"
  | "nextStagedHunk"
  | "prevStagedHunk"
  | "nextStagedRepo"
  | "prevStagedRepo"
  | "repeatLast"
  | "stageHunkAtCursor"
  | "startTracking";

export type Extension = {
  // oob = Out Of Band, i.e. actions that need to happen outside of the
  // extension's span of control.
  oob: OutOfBand;
  editor: EditorView;
  statusBar: StatusBarView;
  explorer: ExplorerView;
  gutter: GutterView;
  git: GitView;
  files: FilesView;
  notifications: MessagesView;
  warnings: MessagesView;
  errors: MessagesView;
  picker: PickerView;
  startup: number;
  timeline: Timeline;
  run(command: Command): Promise<void>;
  dispose(): Promise<void>;
};

const packageJson: unknown = JSON.parse(
  nodeFs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
);

let pooled: { memory: MemoryFs; at: string } | undefined;

export type Options = {
  fixtures?: boolean;
  workspaceFolders?: (polyrepo: OutOfBand) => string[];
};

export async function startExtension(
  options: Options = {},
): Promise<Extension> {
  const mode = process.env.MINDFUL_STAGE_MODE ?? "replay";
  const replayed = mode === "replay";
  const clock: Clock = replayed ? new VirtualClock() : new RealClock();
  const recordings = new Recordings(replayed);
  const reused = replayed ? pooled : undefined;
  pooled = undefined;
  const memory = reused?.memory ?? new MemoryFs();
  const timeline = new Timeline();
  const counting = new CountingFs(replayed ? memory.fs : nodeFs, timeline);
  const fs = counting.fs;
  const real = replayed
    ? undefined
    : await (
        await import("./out-of-band/real")
      ).RealOutOfBand.create(options.fixtures ?? true);
  const recorder =
    mode === "record" && real !== undefined
      ? new Recorder(real.root, recordings)
      : undefined;
  if (recorder !== undefined) {
    real?.recordChanges(recorder);
  }
  let replay: ReplayOutOfBand | undefined;
  let polyrepo: OutOfBand;
  if (real === undefined) {
    replay = ReplayOutOfBand.load(memory, recordings, reused?.at);
    polyrepo = replay;
  } else {
    polyrepo = recorder === undefined ? real : recordedDriver(real, recorder);
  }
  const vscode = await FakeVscode.load(fs, polyrepo.root, packageJson);
  const commands = new CountingGitCommands(
    replayed
      ? new ReplayGitCommands(polyrepo)
      : new RecordingGitCommands(
          new (await import("../../src/git-commands")).SimpleGitCommands(
            new VscodeSettings(vscode),
          ),
          polyrepo,
          recorder,
        ),
    timeline,
  );
  const editor = new FakeEditor(fs, vscode);
  const watcher = new SettlingWatcher(
    editor.watching(
      new ParcelWatcher(
        replayed
          ? memory.subscribe
          : (await import("@parcel/watcher")).subscribe,
      ),
    ),
  );
  const registry = new FakeCommandRegistry();
  const notifier = new FakeNotifier();
  const picker = new FakePicker();
  const statusBar = new FakeStatusBar();
  const badges = new FakeFileDecorations();
  const child = container
    .createChildContainer()
    .register<CommandRegistry>(COMMAND_REGISTRY, { useValue: registry })
    .register<Editor>(EDITOR, { useValue: editor })
    .register<Fs>(FS, { useValue: fs })
    .register<FakeVscode>(VSCODE, { useValue: vscode })
    .registerSingleton<Settings>(SETTINGS, VscodeSettings)
    .register<Notifier>(NOTIFIER, { useValue: notifier })
    .register<GitCommands>(GIT_COMMANDS, { useValue: commands })
    .registerSingleton<Git>(GIT, SimpleGitClient)
    .registerSingleton(GITIGNORES, Gitignores)
    .register<Picker>(PICKER, { useValue: picker })
    .registerSingleton<RepoFinder>(REPO_FINDER, WalkingRepoFinder)
    .register<StatusBar>(STATUS_BAR, { useValue: statusBar })
    .register<string[]>(WORKSPACE_FOLDERS, {
      useValue:
        options.workspaceFolders?.(polyrepo) ?? polyrepo.workspaceFolders,
    })
    .register<Watcher>(WATCHER, { useValue: watcher })
    .registerSingleton<Events>(EVENTS, VscodeEvents)
    .registerSingleton<Theme>(THEME, VscodeTheme)
    .registerSingleton<Decorations>(DECORATIONS, VscodeDecorations)
    .register<FileDecorations>(FILE_DECORATIONS, { useValue: badges })
    .registerSingleton(LOGGER, Logger)
    .registerSingleton(PALETTE, Palette)
    .registerSingleton(COMPOSITOR, Compositor)
    .registerSingleton(WORKSPACE_FILE_WATCHER, WorkspaceFileWatcher)
    .registerSingleton(REPOS, Repos)
    .registerSingleton(WORKSPACE, Workspace)
    .registerSingleton(NAVIGATION, Navigation)
    .registerSingleton(TALLY, Tally)
    .registerSingleton(REPO_PICKER, RepoPicker)
    .registerSingleton(STAGING, GitStager)
    .registerSingleton(GUTTERS, Gutters)
    .registerSingleton(FILE_BADGES, FileBadges)
    .registerSingleton(COMMANDS, Commands);
  const reactions = {
    settled: async () => {
      await child.resolve<Repos>(REPOS).ready();
    },
  };
  polyrepo.attach(watcher, editor, vscode, reactions);
  timeline.restart();
  const starting = performance.now();
  await clock.until(child.resolve(App).start());
  await clock.until(child.resolve<Commands>(COMMANDS).ready());
  const startup = performance.now() - starting;
  const pickerView = new PickerView(picker);
  const run = (command: string) =>
    clock.until(
      (async () => {
        await registry.registered.get(command)!();
        await polyrepo.settled();
        await reactions.settled();
      })(),
    );
  return {
    oob: clocked(polyrepo, clock),
    editor: new EditorView(editor, polyrepo),
    statusBar: new StatusBarView(statusBar, pickerView, run),
    explorer: new ExplorerView(badges, polyrepo),
    git: new GitView(commands, polyrepo),
    files: new FilesView(counting),
    gutter: new GutterView(
      editor,
      polyrepo,
      new GutterColours(vscode, packageJson),
    ),
    notifications: new MessagesView(() => notifier.notices),
    warnings: new MessagesView(() => notifier.warnings),
    errors: new MessagesView(() => notifier.errors),
    picker: pickerView,
    startup,
    timeline,
    run,
    dispose: async () => {
      try {
        await clock.until(
          (async () => {
            await commands.dispose();
            await child.dispose();
          })(),
        );
        recorder?.save();
        await polyrepo.dispose();
        if (replay !== undefined) {
          pooled = { memory, at: replay.at };
        }
      } finally {
        clock.stop();
      }
    },
  };
}
