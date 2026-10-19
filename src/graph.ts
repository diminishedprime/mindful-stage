import * as fs from "fs";
import {
  ColorThemeKind,
  type ExtensionContext,
  extensions,
  Range,
  Uri,
  window,
  workspace,
} from "vscode";
import { container } from "tsyringe";
import { App } from "./app";
import { Commands } from "./commands";
import { Compositor } from "./display/compositor";
import {
  APP,
  COMMAND_REGISTRY,
  COMMANDS,
  COMPOSITOR,
  DECORATIONS,
  EDITOR,
  EVENTS,
  FS,
  FILE_BADGES,
  FILE_DECORATIONS,
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
  VSCODE,
  WORKSPACE_FOLDERS,
  STAGING,
  STATUS_BAR,
  TALLY,
  THEME,
  WATCHER,
  WORKSPACE,
  WORKSPACE_FILE_WATCHER,
} from "./di-tokens";
import { FileBadges } from "./display/file-badges";
import { SimpleGitClient } from "./git";
import { SimpleGitCommands } from "./git-commands";
import { Gitignores } from "./gitignores";
import { Gutters } from "./display/gutters";
import { Logger, type VscodeLogApi } from "./logger";
import { Palette } from "./palette";
import { Navigation } from "./navigation";
import { WalkingRepoFinder } from "./repo-finder";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { GitStager } from "./staging";
import { Tally } from "./tally";
import { Workspace } from "./workspace";
import { WorkspaceFileWatcher } from "./workspace-file-watcher";
import type {
  CommandRegistry,
  Decorations,
  Editor,
  Events,
  Fs,
  FileDecorations,
  Git,
  GitCommands,
  Notifier,
  Picker,
  RepoFinder,
  Settings,
  StatusBar,
  Theme,
  Watcher,
} from "./types";
import { VscodeDecorations } from "./vscode-shims/decorations";
import { VscodeFileDecorations } from "./vscode-shims/file-decorations";
import { VscodeCommandRegistry } from "./vscode-shims/command-registry";
import { VscodeEditor } from "./vscode-shims/editor";
import { VscodeEvents, type VscodeEventsApi } from "./vscode-shims/events";
import { VscodeNotifier } from "./vscode-shims/notifier";
import { VscodePicker } from "./vscode-shims/picker";
import {
  type VscodeConfiguration,
  VscodeSettings,
} from "./vscode-shims/settings";
import { VscodeStatusBar } from "./vscode-shims/status-bar";
import { VscodeTheme, type VscodeThemeApi } from "./vscode-shims/theme";
import { VscodeWatcher } from "./vscode-shims/watcher";
import type { VscodeDecorationApi } from "./vscode-shims/decorations";

type Vscode = VscodeConfiguration &
  VscodeDecorationApi &
  VscodeEventsApi &
  VscodeLogApi &
  VscodeThemeApi;

export function start(context: ExtensionContext): Promise<void> {
  const workspaceFolders = workspace.workspaceFolders ?? [];
  const vscode: Vscode = {
    ColorThemeKind,
    extensions,
    Range,
    Uri,
    window,
    workspace,
  };

  container
    .register<string[]>(WORKSPACE_FOLDERS, {
      useValue: workspaceFolders.map((folder) => folder.uri.fsPath),
    })
    .register<Vscode>(VSCODE, { useValue: vscode })
    .registerSingleton<Editor>(EDITOR, VscodeEditor)
    .register<Fs>(FS, { useValue: fs })
    .registerSingleton<GitCommands>(GIT_COMMANDS, SimpleGitCommands)
    .registerSingleton<Git>(GIT, SimpleGitClient)
    .registerSingleton(GITIGNORES, Gitignores)
    .registerSingleton<Notifier>(NOTIFIER, VscodeNotifier)
    .registerSingleton<Picker>(PICKER, VscodePicker)
    .registerSingleton<RepoFinder>(REPO_FINDER, WalkingRepoFinder)
    .registerSingleton<Settings>(SETTINGS, VscodeSettings)
    .registerSingleton<StatusBar>(STATUS_BAR, VscodeStatusBar)
    .registerSingleton<Theme>(THEME, VscodeTheme)
    .registerSingleton<Watcher>(WATCHER, VscodeWatcher)
    .registerSingleton<CommandRegistry>(COMMAND_REGISTRY, VscodeCommandRegistry)
    .registerSingleton(LOGGER, Logger)
    .registerSingleton(PALETTE, Palette)
    .registerSingleton(COMPOSITOR, Compositor)
    .registerSingleton<Decorations>(DECORATIONS, VscodeDecorations)
    .registerSingleton<Events>(EVENTS, VscodeEvents)
    .registerSingleton(WORKSPACE_FILE_WATCHER, WorkspaceFileWatcher)
    .registerSingleton(REPOS, Repos)
    .registerSingleton(WORKSPACE, Workspace)
    .registerSingleton(NAVIGATION, Navigation)
    .registerSingleton(TALLY, Tally)
    .registerSingleton(REPO_PICKER, RepoPicker)
    .registerSingleton(STAGING, GitStager)
    .registerSingleton(GUTTERS, Gutters)
    .registerSingleton<FileDecorations>(FILE_DECORATIONS, VscodeFileDecorations)
    .registerSingleton(FILE_BADGES, FileBadges)
    .registerSingleton(COMMANDS, Commands)
    .registerSingleton(APP, App);

  context.subscriptions.push({ dispose: () => container.dispose() });
  return container.resolve<App>(APP).start();
}
