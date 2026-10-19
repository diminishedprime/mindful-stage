# Mindful stage

Keyboard-driven incremental staging for VS Code. Jump between unstaged hunks and
files, stage one piece at a time, then commit with a clear picture of what's
going in.

The main use case is reviewing LLM output. LLMs in a polyrepo can be efficient
with the additional context, but will often make changes across many repos which
can be difficult to navigate as a regular person. This extension provides
commands to land on the next (or previous) change, read it (argue with the LLM
about how it's done an absolutely terrible job), then fix it, stage it, and then
move on.

It handles nested git repos across multiple workspaces, and stays fast, even
with hundreds of repos.

Pairs well with [magit].

## Status bar

The status bar summarizes unstaged work across the workspace:

```text
1D 3M 2?
```

Once everything is staged:

```text
ready to commit
```

With no outstanding work:

```text
No changes
```

Clicking on the status bar opens a picker to go directly to a repo with changes.

## Gutter marks and explorer badges

This extension provides gutter marks & file badges/colorization that can be
customized to your preferences.

Turn the gutter marks off with `mindfulStage.decorations`.

Colours follow the active theme's colours, and each one can be overridden:

```jsonc
"workbench.colorCustomizations": {
  "mindfulStage.unstagedChange": "#e5c07b",
  "mindfulStage.stagedChange": "#c678dd",
  "mindfulStage.unstagedDeletion": "#e06c75",
  "mindfulStage.stagedDeletion": "#c678dd",
  "mindfulStage.untracked": "#98c379"
}
```

This has some overlap with the built-in git functionality, set the following to
disable the parts this extension provides:

```jsonc
"scm.diffDecorations": "none",        // built-in gutter marks
"git.decorations.enabled": false,     // built-in explorer badges
"git.countBadge": "off",              // count on the Source Control icon
"git.enableStatusBarSync": false      // Sync item in the status bar
```

## Commands

| Command ID                       | What it does                                              |
| -------------------------------- | --------------------------------------------------------- |
| `mindfulStage.nextUnstaged`      | Jump to next unstaged file                                |
| `mindfulStage.prevUnstaged`      | Jump to previous unstaged file                            |
| `mindfulStage.nextUnstagedHunk`  | Jump to next unstaged hunk                                |
| `mindfulStage.prevUnstagedHunk`  | Jump to previous unstaged hunk                            |
| `mindfulStage.nextStaged`        | Jump to next staged file                                  |
| `mindfulStage.prevStaged`        | Jump to previous staged file                              |
| `mindfulStage.nextStagedHunk`    | Jump to next staged hunk                                  |
| `mindfulStage.prevStagedHunk`    | Jump to previous staged hunk                              |
| `mindfulStage.nextStagedRepo`    | Jump to the next repo with staged changes                 |
| `mindfulStage.prevStagedRepo`    | Jump to the previous repo with staged changes             |
| `mindfulStage.stageHunkAtCursor` | Stage the unstaged hunk under the cursor                  |
| `mindfulStage.startTracking`     | Add an untracked file                                     |
| `mindfulStage.repeatLast`        | Repeat the last navigation                                |
| `mindfulStage.pickRepo`          | Pick from the repos with outstanding work and jump to one |

## Install

There is no Marketplace listing. Build and install locally with [pnpm] and
[just]:

```sh
git clone https://git.lan.mjh.io/diminishedprime/mindful-stage.git
cd mindful-stage
pnpm install
just install
```

## Faster git on Macs

Mindful stage runs git a _lot_. On Macs, setting `git.path` to what Xcode.app
actually ships with will save a decent amount of time on the git spawns.

```jsonc
// settings.json
"git.path": "/Applications/Xcode.app/Contents/Developer/usr/bin/git",
```

## Example keybindings (vim-mode flavored)

These are what I use, paired with vim-mode in `settings.json`. Convention:
`<leader>g` is the git namespace, lowercase = hunk, uppercase = file, `c`
subspace = staged ("cached"), and `r` within it = repo.

```jsonc
"vim.normalModeKeyBindingsNonRecursive": [
  // Unstaged navigation
  { "before": ["<leader>", "g", "n"], "commands": ["mindfulStage.nextUnstagedHunk"] },
  { "before": ["<leader>", "g", "p"], "commands": ["mindfulStage.prevUnstagedHunk"] },
  { "before": ["<leader>", "g", "N"], "commands": ["mindfulStage.nextUnstaged"] },
  { "before": ["<leader>", "g", "P"], "commands": ["mindfulStage.prevUnstaged"] },

  // Staged navigation (c = cached)
  { "before": ["<leader>", "g", "c", "n"], "commands": ["mindfulStage.nextStagedHunk"] },
  { "before": ["<leader>", "g", "c", "p"], "commands": ["mindfulStage.prevStagedHunk"] },
  { "before": ["<leader>", "g", "c", "N"], "commands": ["mindfulStage.nextStaged"] },
  { "before": ["<leader>", "g", "c", "P"], "commands": ["mindfulStage.prevStaged"] },
  { "before": ["<leader>", "g", "c", "r"], "commands": ["mindfulStage.nextStagedRepo"] },
  { "before": ["<leader>", "g", "c", "R"], "commands": ["mindfulStage.prevStagedRepo"] },

  // Stage hunk at cursor, then advance to the next one (review-flow combo)
  { "before": ["<leader>", "g", "s"], "commands": ["mindfulStage.stageHunkAtCursor", "mindfulStage.nextUnstagedHunk"] },

  // Start tracking the file in the active editor
  { "before": ["<leader>", "g", "t"], "commands": ["mindfulStage.startTracking"] },

  // Repeat the last navigation (works for any of the jump commands above)
  { "before": ["<leader>", "."], "commands": ["mindfulStage.repeatLast"] }
]
```

## Example global keybinding

If you want a jump that works from anywhere (not just vim normal mode), bind it
in `keybindings.json`. For example, `Ctrl+x u` to jump to the next unstaged
file:

```jsonc
[{ "key": "ctrl+x u", "command": "mindfulStage.nextUnstaged" }]
```

[magit]: https://marketplace.visualstudio.com/items?itemName=kahole.magit
[pnpm]: https://pnpm.io
[just]: https://just.systems
