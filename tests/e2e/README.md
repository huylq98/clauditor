# Clauditor E2E

Drives the packaged Tauri binary via [tauri-driver](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver) / WebDriver. Spec: `docs/superpowers/specs/2026-04-18-e2e-test-suite-design.md`.

## Run locally

```
pnpm e2e:build      # builds fake-claude + clauditor with --features test-hooks
pnpm e2e            # runs all suites except the gated live one
```

Live smoke (real `claude` CLI):

```
ANTHROPIC_API_KEY=sk-... CLAUDITOR_E2E_LIVE=1 pnpm e2e:live
```

## Updating visual baselines

```
pnpm e2e:visual:update
```

Then **review every PNG** under `tests/e2e/visual/baseline/<platform>/` before committing.
