set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Bundle src into dist/extension.js.
build:
    pnpm build

# Typecheck without emitting.
check:
    pnpm typecheck

# Run the test suite.
test:
    pnpm exec vitest run

# Build a .vsix and install it into the local VS Code.
install: build
    pnpm exec vsce package --no-dependencies
    code --install-extension mindful-stage-*.vsix
