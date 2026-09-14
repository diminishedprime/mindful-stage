import * as vscode from "vscode";
import { container } from "tsyringe";
import { Commands } from "./commands";
import {
  EDITOR,
  GIT,
  GIT_REFRESHER,
  NAVIGATION,
  NOTIFIER,
  PICKER,
  REPO_FINDER,
  REPO_LISTENER,
  REPO_PICKER,
  REPOS,
  WORKSPACE_FOLDERS,
  STAGING,
  STATUS_BAR,
  TALLY,
  WATCHER,
  WORKSPACE,
  WORKSPACE_FILE_WATCHER,
} from "./di-tokens";
import { SimpleGitClient } from "./git";
import { Navigation } from "./navigation";
import { GlobRepoFinder } from "./repo-finder";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { Staging } from "./staging";
import { Tally } from "./tally";
import { Workspace } from "./workspace";
import { WorkspaceFileWatcher } from "./workspace-file-watcher";
import type {
  Editor,
  Git,
  GitRefresher,
  Notifier,
  Picker,
  RepoFinder,
  StatusBar,
  Watcher,
} from "./types";
import { VscodeEditor } from "./vscode-shims/editor";
import { VscodeGitRefresher } from "./vscode-shims/git-refresher";
import { VscodeNotifier } from "./vscode-shims/notifier";
import { VscodePicker } from "./vscode-shims/picker";
import { VscodeStatusBar } from "./vscode-shims/status-bar";
import { VscodeWatcher } from "./vscode-shims/watcher";

export class Extension {
  private static readonly COMMANDS = [
    "nextUnstaged",
    "prevUnstaged",
    "nextStaged",
    "prevStaged",
    "nextUnstagedHunk",
    "prevUnstagedHunk",
    "nextStagedHunk",
    "prevStagedHunk",
    "nextStagedRepo",
    "prevStagedRepo",
    "repeatLast",
    "pickRepo",
    "stageHunkAtCursor",
    "startTracking",
  ] as const;

  constructor(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

    container
      .register<string[]>(WORKSPACE_FOLDERS, {
        useValue: workspaceFolders.map((folder) => folder.uri.fsPath),
      })
      .register<Editor>(EDITOR, { useClass: VscodeEditor })
      .register<Git>(GIT, { useClass: SimpleGitClient })
      .register<GitRefresher>(GIT_REFRESHER, { useClass: VscodeGitRefresher })
      .register<Notifier>(NOTIFIER, { useClass: VscodeNotifier })
      .register<Picker>(PICKER, { useClass: VscodePicker })
      .register<RepoFinder>(REPO_FINDER, { useClass: GlobRepoFinder })
      .register<StatusBar>(STATUS_BAR, { useClass: VscodeStatusBar })
      .register<Watcher>(WATCHER, { useClass: VscodeWatcher })
      .registerSingleton(WORKSPACE_FILE_WATCHER, WorkspaceFileWatcher)
      .registerSingleton(REPOS, Repos)
      .registerSingleton(WORKSPACE, Workspace)
      .registerSingleton(NAVIGATION, Navigation)
      .registerSingleton(TALLY, Tally)
      .registerSingleton(REPO_PICKER, RepoPicker)
      .registerSingleton(STAGING, Staging)
      .register(REPO_LISTENER, { useToken: TALLY });

    const commands = container.resolve(Commands);

    context.subscriptions.push(
      { dispose: () => commands.dispose() },
      ...Extension.COMMANDS.map((command) =>
        vscode.commands.registerCommand(`mindfulStage.${command}`, () =>
          commands[command](),
        ),
      ),
    );
  }
}
