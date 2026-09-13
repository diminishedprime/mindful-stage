import "reflect-metadata";
import * as vscode from "vscode";
import { container } from "tsyringe";
import {
  Commands,
  EDITOR,
  GIT,
  GIT_REFRESHER,
  NOTIFIER,
  REPO_FINDER,
  ROOTS,
  STATUS_BAR,
  WATCHER,
} from "./commands";
import { SimpleGitClient } from "./git";
import { GlobRepoFinder } from "./repo-finder";
import type {
  Editor,
  Git,
  GitRefresher,
  Notifier,
  RepoFinder,
  StatusBar,
  Watcher,
} from "./types";
import { VscodeEditor } from "./vscode-shims/editor";
import { VscodeGitRefresher } from "./vscode-shims/git-refresher";
import { VscodeNotifier } from "./vscode-shims/notifier";
import { VscodeStatusBar } from "./vscode-shims/status-bar";
import { VscodeWatcher } from "./vscode-shims/watcher";

const CATCH_UP_MS = 5 * 60 * 1000;

const COMMANDS = [
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
  "stageHunkAtCursor",
  "startTracking",
] as const;

export function activate(context: vscode.ExtensionContext): void {
  container.register<Editor>(EDITOR, { useClass: VscodeEditor });
  container.register<Git>(GIT, { useClass: SimpleGitClient });
  container.register<GitRefresher>(GIT_REFRESHER, {
    useClass: VscodeGitRefresher,
  });
  container.register<Notifier>(NOTIFIER, { useClass: VscodeNotifier });
  container.register<RepoFinder>(REPO_FINDER, { useClass: GlobRepoFinder });
  container.register<StatusBar>(STATUS_BAR, { useClass: VscodeStatusBar });
  container.register<Watcher>(WATCHER, { useClass: VscodeWatcher });
  container.register<string[]>(ROOTS, {
    useValue: (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath,
    ),
  });
  const commands = container.resolve(Commands);
  const catchUp = setInterval(() => commands.reconcile(), CATCH_UP_MS);
  context.subscriptions.push(
    { dispose: () => clearInterval(catchUp) },
    { dispose: () => commands.dispose() },
    ...COMMANDS.map((command) =>
      vscode.commands.registerCommand(`mindfulStage.${command}`, () =>
        commands[command](),
      ),
    ),
  );
}

export function deactivate(): void {}
