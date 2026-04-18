# Pipeline additions

## Applied in this PR

- **cargo-audit** — new `cargo-audit` job in `ci.yml` using `rustsec/audit-check` action (SHA-pinned). Ignores the four transitive advisories in the Tauri / webkit2gtk / gtk-rs / phf chain that can only be fixed upstream. Any *new* advisory against a direct dep now fails the required `ci-gate`.
- **Top-level `permissions: contents: read`** on all workflows. Per-job escalation where needed (release.yml `build`, dependabot-auto-merge.yml `auto-merge`). Kills four Scorecard Token-Permissions findings.
- **SHA-pinned every GitHub-owned action.** 25 replacements across ci / release / scorecard / pages / claude / claude-code-review. Kills 26 Scorecard Pinned-Dependencies findings.

## Ready to add next (small, scriptable)

### `pnpm audit` job

```yaml
pnpm-audit:
  needs: filter
  if: needs.filter.outputs.frontend == 'true' || needs.filter.outputs.workflows == 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 3
  steps:
    - uses: actions/checkout@<sha> # v6
    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4
    - uses: actions/setup-node@<sha> # v6
      with: { node-version: 24, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm audit --prod --audit-level=high
```

Keep it non-blocking (`continue-on-error: true`) for a week to see the noise floor, then promote to required.

### Accessibility checks in `test:ui-review`

Install `@axe-core/playwright`; add a single assertion in `tests/ui-review.spec.ts` after each screenshot capture:

```ts
import AxeBuilder from '@axe-core/playwright';

test.afterEach(async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});
```

This turns UI/UX doc items #1–#15 from human-review into pipeline-blocking. Start with `continue-on-error: true` until the codebase is clean against current axe rules.

### Touch-target size check

Cheap, no extra dep. Add to `tests/smoke.spec.ts`:

```ts
test('all buttons meet WCAG 2.2 AA 24×24', async ({ page }) => {
  await page.goto('/');
  const boxes = await page.locator('button:visible, [role="button"]:visible').evaluateAll(els =>
    els.map(el => el.getBoundingClientRect()));
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(24);
    expect(b.width).toBeGreaterThanOrEqual(24);
  }
});
```

### License check

```yaml
license-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<sha> # v6
    - run: cargo install cargo-deny --locked
    - run: cargo deny check licenses advisories bans sources
      working-directory: src-tauri
```

Requires a `deny.toml`. Good to add separately from this sweep.

### Broken-link check on docs + README

```yaml
lychee:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<sha> # v6
    - uses: lycheeverse/lychee-action@<sha> # v2
      with:
        args: --no-progress --accept 200,403 '**/*.md'
```

## Not scriptable (stay human-review)

- Security review findings #1–9 require reading the code carefully; only the outcome (clean `cargo audit`) can be CI-gated.
- Most perf findings need human judgment on acceptable tradeoffs (ring buffer vs drain, unmount vs CSS-hide).
- UI/UX P2/nits about copy, visual hierarchy, microcopy, and information architecture.

## Open questions before merging the axe job

- Current `test:ui-review` is informational (`continue-on-error: true` in the `perf` job pattern). Decide whether axe failures should block.
- `@axe-core/playwright` adds ~2MB to the Playwright install; it's already downloading Chromium, so the marginal cost is small but noticeable.
- Some P1 findings in doc 05 are intentional (e.g. `StatusBar size="sm"` is compact by design). Need a per-rule ignore mechanism before the job becomes blocking.
