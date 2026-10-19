# VS Code excerpts

Verbatim excerpts from [microsoft/vscode] at commit [`b86195a`], under the MIT
license in [LICENSE.txt]. Used so the tests behave like the real vs code
filewatcher.

| File         | Copied from                                 | Pieces                                                                            |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `async.ts`   | [`src/vs/base/common/async.ts`]             | `RunOnceScheduler`, `RunOnceWorker`, `IThrottledWorkerOptions`, `ThrottledWorker` |
| `watcher.ts` | [`src/vs/platform/files/common/watcher.ts`] | `coalesceEvents`, `EventCoalescer`                                                |
| `files.ts`   | [`src/vs/platform/files/common/files.ts`]   | `FileChangeType`, `IFileChange`, `isParent`                                       |

Only the import lines differ from upstream. Everything those excerpts import
from elsewhere in VS Code is replaced by the small stand-ins in `stand-ins.ts`,
which is ours.

To update, copy the same pieces from a newer commit and bump the commit here.

`themes/` holds the built-in Dark Modern theme and the two themes it includes,
copied unchanged from `extensions/theme-defaults/themes` in the VS Code 1.140.0
release build, commit [`98cdfb6`]. Used so the theming journey reads a real
theme's include chain.

| File                      | Theme                |
| ------------------------- | -------------------- |
| `themes/dark_modern.json` | Dark Modern          |
| `themes/dark_plus.json`   | Dark+                |
| `themes/dark_vs.json`     | Dark (Visual Studio) |

<!-- prettier-ignore-start -->
[microsoft/vscode]: https://github.com/microsoft/vscode
[`b86195a`]: https://github.com/microsoft/vscode/tree/b86195a58d4bd1631fcac882a52adae15fd31f2d
[LICENSE.txt]: LICENSE.txt
[`98cdfb6`]: https://github.com/microsoft/vscode/tree/98cdfb6c0c38e1d56be3090cdd57efa145852271
[`src/vs/base/common/async.ts`]: https://github.com/microsoft/vscode/blob/b86195a58d4bd1631fcac882a52adae15fd31f2d/src/vs/base/common/async.ts
[`src/vs/platform/files/common/watcher.ts`]: https://github.com/microsoft/vscode/blob/b86195a58d4bd1631fcac882a52adae15fd31f2d/src/vs/platform/files/common/watcher.ts
[`src/vs/platform/files/common/files.ts`]: https://github.com/microsoft/vscode/blob/b86195a58d4bd1631fcac882a52adae15fd31f2d/src/vs/platform/files/common/files.ts
<!-- prettier-ignore-end -->
