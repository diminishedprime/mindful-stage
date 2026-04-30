/// <reference path="./git.d.ts" />

const vscode = require("vscode");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {string} [input]
 * @returns {string}
 */
function git(cwd, args, input) {
  return execFileSync("git", args, { cwd, encoding: "utf8", input });
}

/**
 * @typedef {import("./git.d.ts").API} GitApi
 * @typedef {import("./git.d.ts").Repository} Repository
 * @typedef {import("vscode").Uri} Uri
 * @typedef {import("vscode").TextEditor} TextEditor
 * @typedef {import("vscode").ExtensionContext} ExtensionContext
 * @typedef {import("vscode").Extension<any>} Extension
 */

// git.d.ts is ambient type-only; the Status enum isn't available at runtime,
// so we mirror the numeric value here.
const GIT_STATUS_UNTRACKED = 7; // Status.UNTRACKED

/** @returns {GitApi} */
function getGitApi() {
  const ext = /** @type {Extension} */ (
    vscode.extensions.getExtension("vscode.git")
  );
  return ext.exports.getAPI(1);
}

/**
 * @param {Repository} repo
 * @param {"unstaged" | "staged"} mode
 * @returns {string[]}
 */
function collectChangedPaths(repo, mode) {
  const changes =
    mode === "staged"
      ? repo.state.indexChanges
      : [...repo.state.workingTreeChanges, ...repo.state.untrackedChanges];
  return [...new Set(changes.map((c) => c.uri.fsPath))].sort();
}

/** @param {Repository} repo @param {string} absPath */
function isUntracked(repo, absPath) {
  const all = [
    ...repo.state.workingTreeChanges,
    ...repo.state.untrackedChanges,
  ];
  return (
    all.find((c) => c.uri.fsPath === absPath)?.status === GIT_STATUS_UNTRACKED
  );
}

/** @param {Repository} repo @param {string} absPath */
function hintIfUntracked(repo, absPath) {
  if (!isUntracked(repo, absPath)) return;
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Untracked file — <leader> g t to start tracking",
    },
    () => new Promise((resolve) => setTimeout(resolve, 1500)),
  );
}

function getActiveRepo() {
  const api = getGitApi();
  const active = vscode.window.activeTextEditor?.document.uri;
  const repo = (active && api.getRepository(active)) || api.repositories[0];
  if (!repo) {
    vscode.window.showInformationMessage("mindful-stage: no git repository here");
    return null;
  }
  return repo;
}

/**
 * @param {1 | -1} direction
 * @param {"unstaged" | "staged"} mode
 */
async function jump(direction, mode) {
  const repo = getActiveRepo();
  if (!repo) return;
  const files = collectChangedPaths(repo, mode);
  if (files.length === 0) {
    vscode.window.showInformationMessage(`mindful-stage: no ${mode} files`);
    return;
  }

  const current = vscode.window.activeTextEditor?.document.uri.fsPath;
  const idx = current ? files.indexOf(current) : -1;
  const next =
    idx === -1
      ? files[direction > 0 ? 0 : files.length - 1]
      : files[(idx + direction + files.length) % files.length];

  const doc = await vscode.workspace.openTextDocument(next);
  await vscode.window.showTextDocument(doc, { preserveFocus: false });
  if (mode === "unstaged") hintIfUntracked(repo, next);
}

async function startTracking() {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    vscode.window.showInformationMessage("mindful-stage: no file to track");
    return;
  }
  const repo = getActiveRepo();
  if (!repo) return;
  const repoRoot = repo.rootUri.fsPath;
  const rel = path.relative(repoRoot, uri.fsPath);
  try {
    // Reject if already tracked. ls-files exits non-zero when the file is
    // unknown to the index, which is the case we want.
    let alreadyTracked = false;
    try {
      git(repoRoot, ["ls-files", "--error-unmatch", "--", rel]);
      alreadyTracked = true;
    } catch {
      // expected for untracked files
    }
    if (alreadyTracked) {
      vscode.window.showErrorMessage(
        `mindful-stage: '${path.basename(rel)}' is already tracked`,
      );
      return;
    }

    // Stage just the first line: hash it as a blob, then add to the index
    // as if it were a regular file. Gives magit a real diff to work with
    // (intent-to-add doesn't, hence this dance).
    const content = fs.readFileSync(uri.fsPath, "utf8");
    const nlIdx = content.indexOf("\n");
    const firstLine = nlIdx === -1 ? content : content.slice(0, nlIdx + 1);
    const hash = git(repoRoot, ["hash-object", "-w", "--stdin"], firstLine).trim();
    git(repoRoot, [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${hash},${rel}`,
    ]);
    await repo.status();
    vscode.window.setStatusBarMessage(
      `mindful-stage: tracking ${path.basename(uri.fsPath)}`,
      3000,
    );
  } catch (/** @type {any} */ e) {
    const msg = (e.stderr || e.message)
      .trim()
      .replaceAll(rel, path.basename(rel));
    vscode.window.showErrorMessage(`mindful-stage: ${msg}`);
  }
}

// Unified-diff hunk header:
//   @@ -(oldStart)(,oldCount)? +(newStart)(,newCount)? @@
// Counts default to 1 when omitted. Captures the new-side `start` and
// (optional) `count` — where the hunk lives in the current file and how
// many lines it spans.
//   @@ -12,3 +14,5 @@
//   @@ -7 +9 @@
//   @@ -20,0 +21,4 @@ function foo() {
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/gm;

/** @typedef {{ start: number; count: number }} Hunk */

/**
 * @param {string} repoRoot
 * @param {string} absPath
 * @param {"unstaged" | "staged"} mode
 * @returns {string}
 */
function diffText(repoRoot, absPath, mode) {
  const rel = path.relative(repoRoot, absPath);
  const args = ["diff", "-U0"];
  if (mode === "staged") args.push("--cached");
  args.push("--", rel);
  return git(repoRoot, args);
}

/** @param {string} diff @returns {Hunk[]} */
function parseHunks(diff) {
  return [...diff.matchAll(HUNK_HEADER)].map((m) => ({
    // Pure-deletion hunks report newStart = 0 (anchor is before line 1);
    // clamp so we always land on a real line.
    start: Math.max(1, parseInt(m[1], 10)),
    count: m[2] === undefined ? 1 : parseInt(m[2], 10),
  }));
}

/**
 * @param {string} repoRoot
 * @param {string} absPath
 * @param {"unstaged" | "staged"} mode
 * @returns {Hunk[]} 1-indexed line ranges
 */
function hunks(repoRoot, absPath, mode) {
  return parseHunks(diffText(repoRoot, absPath, mode));
}

/** @param {TextEditor} editor @param {number} line1 */
function revealLine(editor, line1) {
  const pos = new vscode.Position(line1 - 1, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(
    new vscode.Range(pos, pos),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

/**
 * @param {1 | -1} direction
 * @param {"unstaged" | "staged"} mode
 */
async function jumpHunk(direction, mode) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const repo = getGitApi().getRepository(editor.document.uri);
  if (!repo) return;

  const repoRoot = repo.rootUri.fsPath;
  const curPath = editor.document.uri.fsPath;
  const starts = hunks(repoRoot, curPath, mode).map((h) => h.start);
  const cursor = editor.selection.active.line + 1;
  const next =
    direction > 0
      ? starts.find((s) => s > cursor)
      : starts.filter((s) => s < cursor).pop();

  if (next !== undefined) {
    revealLine(editor, next);
    return;
  }

  // No more hunks in this file — spill into the next changed file.
  const files = collectChangedPaths(repo, mode);
  if (files.length === 0) return;
  const idx = files.indexOf(curPath);
  const targetPath =
    idx === -1
      ? files[direction > 0 ? 0 : files.length - 1]
      : files[(idx + direction + files.length) % files.length];

  const doc = await vscode.workspace.openTextDocument(targetPath);
  const newEditor = await vscode.window.showTextDocument(doc);
  const newStarts = hunks(repoRoot, targetPath, mode).map((h) => h.start);
  if (newStarts.length) {
    revealLine(
      newEditor,
      direction > 0 ? newStarts[0] : newStarts[newStarts.length - 1],
    );
  }
  if (mode === "unstaged") hintIfUntracked(repo, targetPath);
}

function stageHunkAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const repo = getActiveRepo();
  if (!repo) return;

  const repoRoot = repo.rootUri.fsPath;
  const absPath = editor.document.uri.fsPath;
  const cursor = editor.selection.active.line + 1;

  const diff = diffText(repoRoot, absPath, "unstaged");
  const hunkList = parseHunks(diff);
  const idx = hunkList.findIndex(
    (h) => h.start <= cursor && cursor < h.start + Math.max(h.count, 1),
  );
  if (idx === -1) {
    vscode.window.setStatusBarMessage("mindful-stage: no unstaged hunk at cursor", 2000);
    return;
  }

  // Split the diff into [file header, ...hunkBodies]; the hunk bodies are
  // parallel to `hunkList`, so `chunks[idx]` is the patch text for our hunk.
  const firstAt = diff.search(/^@@ /m);
  const header = diff.slice(0, firstAt);
  const chunks = diff.slice(firstAt).split(/(?=^@@ )/m);

  try {
    git(repoRoot, ["apply", "--cached", "--unidiff-zero"], header + chunks[idx]);
  } catch (/** @type {any} */ e) {
    vscode.window.showErrorMessage(`mindful-stage: ${(e.stderr || e.message).trim()}`);
  }
}

/** @type {(() => unknown) | null} */
let lastNav = null;

/**
 * Wrap a nav so invoking it also stamps `lastNav`, enabling `repeatLast`.
 * @param {() => unknown} fn
 */
function repeatable(fn) {
  return () => {
    lastNav = fn;
    return fn();
  };
}

/** @param {ExtensionContext} context */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mindfulStage.nextUnstaged",
      repeatable(() => jump(1, "unstaged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.prevUnstaged",
      repeatable(() => jump(-1, "unstaged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.nextStaged",
      repeatable(() => jump(1, "staged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.prevStaged",
      repeatable(() => jump(-1, "staged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.nextUnstagedHunk",
      repeatable(() => jumpHunk(1, "unstaged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.prevUnstagedHunk",
      repeatable(() => jumpHunk(-1, "unstaged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.nextStagedHunk",
      repeatable(() => jumpHunk(1, "staged")),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.prevStagedHunk",
      repeatable(() => jumpHunk(-1, "staged")),
    ),
    vscode.commands.registerCommand("mindfulStage.repeatLast", () => lastNav?.()),
    vscode.commands.registerCommand(
      "mindfulStage.stageHunkAtCursor",
      stageHunkAtCursor,
    ),
    vscode.commands.registerCommand("mindfulStage.startTracking", startTracking),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
