# Mindful Stage

Keyboard-driven incremental staging for VS Code. Jump between unstaged hunks and
files, stage one piece at a time, then commit with a clear picture of what's
going in.

Pairs well with the
[magit](https://marketplace.visualstudio.com/items?itemName=kahole.magit)

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
| `mindfulStage.stageHunkAtCursor` | Stage the unstaged hunk under the cursor                                            |
| `mindfulStage.startTracking`     | Add an untracked file (stages just line 1, so you can review the rest hunk-by-hunk) |
| `mindfulStage.repeatLast`        | Repeat the last navigation                                                          |

## Install

There's no Marketplace listing yet. Build and install locally:

```sh
git clone https://github.com/diminishedprime/mindful-stage.git
cd mindful-stage
npm install
npx vsce package
code --install-extension mindful-stage-*.vsix
```

Re-run `npx vsce package && code --install-extension mindful-stage-*.vsix` after
pulling updates.

## Example keybindings (vim-mode flavored)

These are what I use, paired with vim-mode in `settings.json`. Convention:
`<leader>g` is the git namespace, lowercase = hunk, uppercase = file, `c`
subspace = staged ("cached").

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

  // Stage hunk at cursor, then advance to the next one (review-flow combo)
  { "before": ["<leader>", "g", "s"], "commands": ["mindfulStage.stageHunkAtCursor", "mindfulStage.nextUnstagedHunk"] },

  // Start tracking the file in the active editor
  { "before": ["<leader>", "g", "t"], "commands": ["mindfulStage.startTracking"] },

  // Repeat the last navigation (works for any of the jump commands above)
  { "before": ["<leader>", "."], "commands": ["mindfulStage.repeatLast"] }
]
```

I personally find myself using `<leader> gs` a lot. It's helpful for going
through an LLM-diff, staging piece-by-piece while still having some idea of
what's going on.

## Example global keybinding

If you want a jump that works from anywhere (not just vim normal mode), bind it
in `keybindings.json`. For example, `Ctrl+X U` to jump to the next unstaged
file:

```jsonc
[
  { "key": "ctrl+x u", "command": "mindfulStage.nextUnstaged" }
]
```
