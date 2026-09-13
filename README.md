# Mindful stage

Keyboard-driven incremental staging for VS Code. Jump between unstaged hunks and
files, stage one piece at a time, then commit with a clear picture of what's
going in.

The main use case is mindfully reviewing LLM output. LLMs working in a polyrepo
setup can be very efficient with the additional context, but this often results
in files changed across many repos which can be difficult to navigate. This
extension provides commands to land on the next (or previous) change, read it
(argue with the LLM about how it's terrible), fix it, stage it, and then move
on.

It handles nested git repos across every workspace folders, and will stay fast,
even with hundreds of repos.

Pairs exceptionally well with [magit] for the commit step.

## Status bar

A status bar item summarizes the state across every repo in the workspace, using
git's status letters:

```text
3M 1D 2? 2 unpushed 1 unlinked
```

3 [M]odified, 1 [D]eletion, 2 [?]untracked

With everything staged, reads `ready to commit` With no outstanding work, reads
`No changes`

Hovering on the status bar shows the breakdown per repo. And clicking on it
opens a list to choose a repo to go directly to.

## Commands

All commands are prefixed `Mindful Stage:` in the command palette.

| Command ID                       | What it does                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `mindfulStage.nextUnstaged`      | Jump to next unstaged file                                                          |
| `mindfulStage.prevUnstaged`      | Jump to previous unstaged file                                                      |
| `mindfulStage.nextUnstagedHunk`  | Jump to next unstaged hunk                                                          |
| `mindfulStage.prevUnstagedHunk`  | Jump to previous unstaged hunk                                                      |
| `mindfulStage.nextStaged`        | Jump to next staged file                                                            |
| `mindfulStage.prevStaged`        | Jump to previous staged file                                                        |
| `mindfulStage.nextStagedHunk`    | Jump to next staged hunk                                                            |
| `mindfulStage.prevStagedHunk`    | Jump to previous staged hunk                                                        |
| `mindfulStage.nextStagedRepo`    | Jump to the next repo with staged changes                                           |
| `mindfulStage.prevStagedRepo`    | Jump to the previous repo with staged changes                                       |
| `mindfulStage.stageHunkAtCursor` | Stage the unstaged hunk under the cursor                                            |
| `mindfulStage.startTracking`     | Add an untracked file (stages just line 1, so you can review the rest hunk-by-hunk) |
| `mindfulStage.repeatLast`        | Repeat the last navigation                                                          |
| `mindfulStage.pickRepo`          | Pick from the repos with outstanding work and jump to one                           |

## Install

There is no Marketplace listing. Build and install locally with [pnpm] and
[just]:

```sh
git clone https://git.lan.mjh.io/lab/mindful-stage.git
cd mindful-stage
pnpm install
just install
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
in `keybindings.json`. For example, `Ctrl+X U` to jump to the next unstaged
file:

```jsonc
[{ "key": "ctrl+x u", "command": "mindfulStage.nextUnstaged" }]
```

[magit]: https://marketplace.visualstudio.com/items?itemName=kahole.magit
[pnpm]: https://pnpm.io
[just]: https://just.systems
