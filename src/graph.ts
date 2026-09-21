import * as vscode from "vscode";
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
  FILE_BADGES,
  FILE_DECORATIONS,
  GIT,
  GUTTER_ICON,
  GUTTERS,
  LOG_DIRECTORY,
  LOGGER,
  MANIFEST,
  NAVIGATION,
  NOTIFIER,
  PACKAGE_JSON,
  PALETTE,
  PICKER,
  REPO_FINDER,
  REPO_PICKER,
  REPOS,
  SETTINGS,
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
import { GutterIcon } from "./display/gutter-icon";
import { Gutters } from "./display/gutters";
import { Logger } from "./logger";
import { Palette } from "./palette";
import { Manifest } from "./palette/manifest";
import { Navigation } from "./navigation";
import { GlobRepoFinder } from "./repo-finder";
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
  FileDecorations,
  Git,
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
import { VscodeEvents } from "./vscode-shims/events";
import { VscodeNotifier } from "./vscode-shims/notifier";
import { VscodePicker } from "./vscode-shims/picker";
import { VscodeSettings } from "./vscode-shims/settings";
import { VscodeStatusBar } from "./vscode-shims/status-bar";
import { VscodeTheme } from "./vscode-shims/theme";
import { VscodeWatcher } from "./vscode-shims/watcher";

export function start(context: vscode.ExtensionContext): void {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  container
    .register<string[]>(WORKSPACE_FOLDERS, {
      useValue: workspaceFolders.map((folder) => folder.uri.fsPath),
    })
    .register<string>(LOG_DIRECTORY, {
      useValue: context.globalStorageUri.fsPath,
    })
    .register<unknown>(PACKAGE_JSON, {
      useValue: context.extension.packageJSON,
    })
    .register<Editor>(EDITOR, { useClass: VscodeEditor })
    .register<Git>(GIT, { useClass: SimpleGitClient })
    .register<Notifier>(NOTIFIER, { useClass: VscodeNotifier })
    .register<Picker>(PICKER, { useClass: VscodePicker })
    .register<RepoFinder>(REPO_FINDER, { useClass: GlobRepoFinder })
    .register<Settings>(SETTINGS, { useClass: VscodeSettings })
    .register<StatusBar>(STATUS_BAR, { useClass: VscodeStatusBar })
    .register<Theme>(THEME, { useClass: VscodeTheme })
    .register<Watcher>(WATCHER, { useClass: VscodeWatcher })
    .register<CommandRegistry>(COMMAND_REGISTRY, {
      useClass: VscodeCommandRegistry,
    })
    .registerSingleton(LOGGER, Logger)
    .registerSingleton(MANIFEST, Manifest)
    .registerSingleton(PALETTE, Palette)
    .registerSingleton(COMPOSITOR, Compositor)
    .registerSingleton(GUTTER_ICON, GutterIcon)
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

  container.resolve<App>(APP).start(context);
}
