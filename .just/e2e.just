set shell := ["zsh", "-euo", "pipefail", "-c"]
set script-interpreter := ["zsh", "-euo", "pipefail"]

root := justfile_directory()

mutation:
    cd {{ root }} && pnpm pack-fixtures && NODE_COMPILE_CACHE=node_modules/.cache/node-compile pnpm exec stryker run --concurrency $(node scripts/performance-cores.mjs)

# Record the e2e journeys into fixtures
[script]
record:
    cd {{ root }}
    trap 'git add -A test/setup/fixtures' EXIT
    rm -rf test/setup/fixtures
    MINDFUL_STAGE_MODE=record pnpm exec vitest run --no-file-parallelism --bail=1 test/e2e

# Profile startup against the polyrepo this project lives in.
[script]
profile:
    cd {{ root }}
    find ${PWD:h:h:h:h} -name .git -type d -prune -not -path '*/node_modules/*' | while read -r git_dir; do
        git -C ${git_dir:h} update-index -q --refresh >/dev/null || true
    done
    rm -rf node_modules/.cache/profiles
    MINDFUL_STAGE_MODE=real MINDFUL_STAGE_PROFILE=1 pnpm exec vitest run --reporter=verbose
    node scripts/summarize-profile.mjs node_modules/.cache/profiles
