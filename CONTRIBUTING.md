# Contributing to Clauditor

Thanks for your interest. Before you spend time on anything non-trivial, **open an issue first** so we can align on direction.

## Getting set up

**Requirements**
- Node.js **24** ([nvm users: `nvm use`](https://github.com/nvm-sh/nvm))
- pnpm **10** (`npm install -g pnpm` or via `corepack enable`)
- Rust **1.80+** via [rustup](https://rustup.rs/)
- On Windows: MSVC Build Tools (rustup prompts you)
- On Linux: `webkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `build-essential`
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code/setup) on your `PATH`

```bash
git clone https://github.com/huylq98/clauditor.git
cd clauditor
pnpm install
pnpm tauri dev
```

## Branching

- `main` is protected — only merges via PR with green CI.
- Branch names: `feat/short-slug`, `fix/short-slug`, `ci/short-slug`, `docs/short-slug`.
- Keep PRs focused: one feature / fix per PR. It's fine to stack small PRs.

## Commits

Clauditor uses a lightweight conventional-commits flavor:

```
feat(renderer): add drag-to-reorder tabs
fix(pty): resolve Windows ConPTY shutdown race
docs(readme): clarify MSVC setup
ci(pages): auto-enable on first deploy
deps(frontend): bump xterm family to 5.6
perf: memoize TerminalHost on tab switch
```

Allowed prefixes: `feat`, `fix`, `docs`, `ci`, `perf`, `refactor`, `test`, `deps`, `chore`.

## Code style

- Rust: `cargo fmt --all` + `cargo clippy --all-targets -- -D warnings`.
- TS: `tsc -b` clean + `npm run lint`.
- No new ESLint disables without a comment explaining why.
- Prefer functional edits over reformatting existing code — keep diffs small.

## Testing

```bash
pnpm test:smoke         # renders + core flows, ~5s
pnpm test:ui-review     # screenshot capture, ~55s
pnpm perf               # latency suite (dev server)
pnpm perf:prod          # latency suite (prod build)

cd src-tauri
cargo test --all
```

Every PR must leave `frontend`, `backend (*)`, and `ci-gate` green. The perf job is informational — a regression there should still raise an eyebrow.

## Submitting a PR

1. Fork → branch → commit.
2. Open the PR. Fill out the template.
3. CI runs automatically. Wait for green on the required checks.
4. A reviewer (currently @huylq98) will take a look. For Dependabot PRs, patch/minor bumps auto-merge once green.

## End-to-end tests

The `tests/e2e/` suite drives the packaged Tauri binary via [tauri-driver](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver) / WebDriver.

```sh
pnpm e2e:build               # builds fake-claude + clauditor with --features test-hooks
pnpm e2e                     # runs all suites except the gated live one
pnpm e2e:visual:update       # regenerate visual baselines after intentional UI change
ANTHROPIC_API_KEY=sk-... CLAUDITOR_E2E_LIVE=1 pnpm e2e:live
```

Visual baselines live under `tests/e2e/visual/baseline/<platform>/`. After updating, **review every PNG** before committing.

CI runs the suite on Windows + Linux (see `.github/workflows/e2e.yml`); the nightly `e2e-live.yml` runs the real-CLI smoke gated on `ANTHROPIC_API_KEY`.

## Anything else

- Security issues — see [`SECURITY.md`](./SECURITY.md).
- Questions — open a [Discussion](https://github.com/huylq98/clauditor/discussions) instead of an Issue.
- Licensing — by contributing you agree your work is released under the project's [MIT license](./LICENSE).

Welcome aboard.
