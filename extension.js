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
// so we mirror the numeric values here.
const GIT_STATUS_INDEX_DELETED = 2;
const GIT_STATUS_DELETED = 6;
const GIT_STATUS_UNTRACKED = 7;
const GIT_STATUS_DELETED_BY_US = 15;
const GIT_STATUS_DELETED_BY_THEM = 16;
const GIT_STATUS_BOTH_DELETED = 18;
const DELETED_STATUSES = new Set([
  GIT_STATUS_INDEX_DELETED,
  GIT_STATUS_DELETED,
  GIT_STATUS_DELETED_BY_US,
  GIT_STATUS_DELETED_BY_THEM,
  GIT_STATUS_BOTH_DELETED,
]);

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
  // A dirty submodule shows up in the parent repo's changes as the submodule
  // directory itself, which isn't a text document — skip those so we don't
  // try to open a directory.
  const submoduleRoots = new Set(
    getGitApi()
      .repositories.filter((r) => r.rootUri.fsPath !== repo.rootUri.fsPath)
      .map((r) => r.rootUri.fsPath),
  );
  // Deleted files have nothing to open as a text document.
  const live = changes.filter((c) => !DELETED_STATUSES.has(c.status));
  return [...new Set(live.map((c) => c.uri.fsPath))]
    .filter((p) => !submoduleRoots.has(p))
    .sort();
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

/**
 * Heads-up when navigation crosses a repo boundary, so a hop into a sibling
 * submodule isn't silent.
 * @param {Repository | null | undefined} prev
 * @param {Repository} next
 */
function notifyRepoChange(prev, next) {
  if (prev && prev.rootUri.fsPath === next.rootUri.fsPath) return;
  const name = path.basename(next.rootUri.fsPath);
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `mindful-stage: now in ${name}`,
    },
    () => new Promise((resolve) => setTimeout(resolve, 1500)),
  );
}

function getActiveRepo() {
  const api = getGitApi();
  const active = vscode.window.activeTextEditor?.document.uri;
  const repo = (active && api.getRepository(active)) || api.repositories[0];
  if (!repo) {
    vscode.window.showInformationMessage(
      "mindful-stage: no git repository here",
    );
    return null;
  }
  return repo;
}

/**
 * Flatten changes across every loaded repo into a single ordered ring.
 * Order: repository registration order, then sorted file path within each.
 * Lets navigation hop from the last unstaged file in one repo into the first
 * unstaged file of the next, wrapping at the end.
 * @param {"unstaged" | "staged"} mode
 * @returns {{ repo: Repository; path: string }[]}
 */
function collectAllChanges(mode) {
  return getGitApi().repositories.flatMap((repo) =>
    collectChangedPaths(repo, mode).map((path) => ({ repo, path })),
  );
}

/**
 * @param {1 | -1} direction
 * @param {"unstaged" | "staged"} mode
 */
async function jump(direction, mode) {
  const all = collectAllChanges(mode);
  if (all.length === 0) {
    vscode.window.showInformationMessage(`mindful-stage: no ${mode} files`);
    return;
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const prevRepo = activeUri ? getGitApi().getRepository(activeUri) : null;
  const idx = activeUri
    ? all.findIndex((e) => e.path === activeUri.fsPath)
    : -1;
  const nextIdx =
    idx === -1
      ? direction > 0
        ? 0
        : all.length - 1
      : (idx + direction + all.length) % all.length;
  const target = all[nextIdx];

  const doc = await vscode.workspace.openTextDocument(target.path);
  await vscode.window.showTextDocument(doc, { preserveFocus: false });
  notifyRepoChange(prevRepo, target.repo);
  if (mode === "unstaged") hintIfUntracked(target.repo, target.path);
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
    const hash = git(
      repoRoot,
      ["hash-object", "-w", "--stdin"],
      firstLine,
    ).trim();
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

  // No more hunks in this file — spill into the next changed file across
  // every loaded repo, so we hop into a sibling submodule when this one
  // is exhausted.
  const all = collectAllChanges(mode);
  if (all.length === 0) return;
  const idx = all.findIndex((e) => e.path === curPath);
  const target =
    idx === -1
      ? all[direction > 0 ? 0 : all.length - 1]
      : all[(idx + direction + all.length) % all.length];

  const doc = await vscode.workspace.openTextDocument(target.path);
  const newEditor = await vscode.window.showTextDocument(doc);
  const newStarts = hunks(target.repo.rootUri.fsPath, target.path, mode).map(
    (h) => h.start,
  );
  if (newStarts.length) {
    revealLine(
      newEditor,
      direction > 0 ? newStarts[0] : newStarts[newStarts.length - 1],
    );
  }
  notifyRepoChange(repo, target.repo);
  if (mode === "unstaged") hintIfUntracked(target.repo, target.path);
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
    vscode.window.setStatusBarMessage(
      "mindful-stage: no unstaged hunk at cursor",
      2000,
    );
    return;
  }

  // Split the diff into [file header, ...hunkBodies]; the hunk bodies are
  // parallel to `hunkList`, so `chunks[idx]` is the patch text for our hunk.
  const firstAt = diff.search(/^@@ /m);
  const header = diff.slice(0, firstAt);
  const chunks = diff.slice(firstAt).split(/(?=^@@ )/m);

  try {
    git(
      repoRoot,
      ["apply", "--cached", "--unidiff-zero"],
      header + chunks[idx],
    );
  } catch (/** @type {any} */ e) {
    vscode.window.showErrorMessage(
      `mindful-stage: ${(e.stderr || e.message).trim()}`,
    );
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
    vscode.commands.registerCommand("mindfulStage.repeatLast", () =>
      lastNav?.(),
    ),
    vscode.commands.registerCommand(
      "mindfulStage.stageHunkAtCursor",
      stageHunkAtCursor,
    ),
    vscode.commands.registerCommand(
      "mindfulStage.startTracking",
      startTracking,
    ),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
