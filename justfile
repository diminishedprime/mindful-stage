set shell := ["zsh", "-euo", "pipefail", "-c"]
set script-interpreter := ["zsh", "-euo", "pipefail"]
set fallback

mod e2e ".just/e2e.just"

default:
    @just --list

# Bundle src into dist/extension.js.
build:
    pnpm build

# Regenerate the icon font from the SVGs in assets/icons.
icons:
    pnpm icons

# Typecheck without emitting.
check:
    pnpm typecheck

format:
    pnpm exec prettier --write --ignore-unknown .

# Run the test suite against the recorded fakes.
test:
    pnpm pack-fixtures
    NODE_COMPILE_CACHE=node_modules/.cache/node-compile pnpm exec vitest run

# Run the test suite without the fakes.
test-real:
    MINDFUL_STAGE_MODE=real pnpm exec vitest run

# Build and install into VS Code.
install:
    pnpm install
    pnpm build
    pnpm package
    code --install-extension mindful-stage-$(node -p 'require("./package.json").version').vsix
