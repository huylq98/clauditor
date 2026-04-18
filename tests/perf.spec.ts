import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Clauditor performance suite — synthesizes user interactions, measures latency,
 * and grades against industry budgets derived from:
 *   - Google RAIL model (Response/Animation/Idle/Load)
 *   - Web Vitals (INP < 200ms good, < 500ms needs-work)
 *   - Desktop-app conventions (VS Code's ~50ms tab-switch target, Warp's <16ms
 *     keystroke-to-paint budget for a terminal)
 *
 * Each test writes its measurements to a per-test JSON file under tests/artifacts/perf.
 * A finalizer spec (perf.final.spec.ts won't work across workers — we instead
 * render the report from this file's afterAll by reading the directory).
 *
 * Runs against the Vite dev server + mock backend — real-PTY overhead is
 * not measured here (that's a tauri-driver job).
 */

const ART = 'tests/artifacts/perf';

const BUDGETS = {
  PALETTE_OPEN:   { good: 100, ok: 200 },  // INP good < 200ms
  TAB_SWITCH:     { good: 50,  ok: 120 },  // VS Code / Warp tab-switch
  SIDEBAR_TOGGLE: { good: 100, ok: 200 },
  SESSION_CREATE: { good: 150, ok: 400 },
  KEYSTROKE_LAG:  { good: 16,  ok: 33 },   // 1-2 frames @ 60Hz
  HYDRATION:      { good: 150, ok: 500 },
} as const;

type Budget = { good: number; ok: number };
type Grade = 'good' | 'ok' | 'poor';

function grade(ms: number, b: Budget): Grade {
  if (ms <= b.good) return 'good';
  if (ms <= b.ok) return 'ok';
  return 'poor';
}

interface Result {
  name: string;
  ms: number;
  samples: number[];
  budget: Budget;
  grade: Grade;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function writeResult(r: Result) {
  fs.mkdirSync(ART, { recursive: true });
  const file = path.join(ART, `${slug(r.name)}.json`);
  await fs.promises.writeFile(file, JSON.stringify(r, null, 2));
}

function recordOne(name: string, ms: number, samples: number[], budget: Budget): Result {
  return { name, ms, samples, budget, grade: grade(ms, budget) };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function freshPage(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  // Wait for the new-session button, which only renders after App's mount
  // effect (which installs the ⌘T keyboard handler) has run.
  await page.waitForSelector('[aria-label="New session"]', { timeout: 5000 });
  await page.waitForTimeout(150);
}

async function makeSession(page: Page, cwd = 'C:\\Users\\demo\\repo') {
  page.once('dialog', (d) => d.accept(cwd));
  await page.keyboard.press('Control+T');
  await page.waitForTimeout(350);
}

async function measurePaint(page: Page, interact: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  await interact();
  // Wait two rAFs to let React render + browser paint
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  return Date.now() - t0;
}

test.beforeAll(() => {
  fs.mkdirSync(ART, { recursive: true });
});

test.describe('Perf — app latency budgets', () => {
  test('hydration — dev-server to first paint', async ({ page }) => {
    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = Date.now();
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForSelector('header', { timeout: 5000 });
      samples.push(Date.now() - start);
    }
    await writeResult(
      recordOne('Initial hydration', median(samples), samples, BUDGETS.HYDRATION),
    );
  });

  test('palette open — ⌘K to visible input', async ({ page }) => {
    await freshPage(page);
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const ms = await measurePaint(page, async () => {
        await page.keyboard.press('Control+K');
        await page.waitForSelector('input[placeholder*="command"]', { timeout: 1000 });
      });
      samples.push(ms);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
    await writeResult(
      recordOne('Palette open (median/5)', median(samples), samples, BUDGETS.PALETTE_OPEN),
    );
  });

  test('sidebar toggle — ⌘B', async ({ page }) => {
    await freshPage(page);
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const ms = await measurePaint(page, async () => {
        await page.keyboard.press('Control+B');
      });
      samples.push(ms);
      await page.waitForTimeout(80);
    }
    await writeResult(
      recordOne('Sidebar toggle (median/5)', median(samples), samples, BUDGETS.SIDEBAR_TOGGLE),
    );
  });

  test('session create — ⌘T through to tab appearing', async ({ page }) => {
    await freshPage(page);
    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const beforeCount = await page.locator('[data-tab-id]').count();
      const ms = await measurePaint(page, async () => {
        page.once('dialog', (d) => d.accept(`C:\\Users\\demo\\repo-${i}`));
        await page.keyboard.press('Control+T');
        await page.waitForFunction(
          (prev) => document.querySelectorAll('[data-tab-id]').length > prev,
          beforeCount,
          { timeout: 2000 },
        );
      });
      samples.push(ms);
    }
    await writeResult(
      recordOne('Session create (median/3)', median(samples), samples, BUDGETS.SESSION_CREATE),
    );
  });

  test('tab switch — click inactive tab', async ({ page }) => {
    await freshPage(page);
    for (let i = 0; i < 4; i += 1) await makeSession(page, `C:\\Users\\demo\\repo-${i}`);
    const tabs = await page.locator('[data-tab-id]').all();
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const target = tabs[i % tabs.length];
      const ms = await measurePaint(page, async () => {
        await target.click();
      });
      samples.push(ms);
    }
    await writeResult(
      recordOne('Tab switch (median/5)', median(samples), samples, BUDGETS.TAB_SWITCH),
    );
  });

  test('keystroke → terminal paint latency', async ({ page }) => {
    await freshPage(page);
    await makeSession(page);
    await page.waitForTimeout(500);
    await page.locator('.xterm').first().click();

    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const ms = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const rows = document.querySelector('.xterm-rows');
          const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
          if (!rows || !textarea) return resolve(-1);
          textarea.focus();
          const t0 = performance.now();
          const obs = new MutationObserver(() => {
            obs.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - t0));
          });
          obs.observe(rows, { childList: true, subtree: true, characterData: true });
          // Synthesize input: dispatch onData equivalent via keydown
          textarea.value += 'a';
          textarea.dispatchEvent(new InputEvent('input', { data: 'a', bubbles: true }));
          setTimeout(() => {
            obs.disconnect();
            resolve(performance.now() - t0);
          }, 150);
        });
      });
      if (ms >= 0) samples.push(ms);
      await page.waitForTimeout(60);
    }
    if (samples.length > 0) {
      await writeResult(
        recordOne('Keystroke → paint (median)', median(samples), samples, BUDGETS.KEYSTROKE_LAG),
      );
    }
  });

  test('zzz_render_report', async () => {
    // Runs last (Playwright runs tests in declared order within a describe).
    const files = fs.readdirSync(ART).filter((f) => f.endsWith('.json'));
    const rows: Result[] = files
      .filter((f) => f !== 'report.json')
      .map((f) => JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8')));

    // Stable ordering matching declaration order
    const order = [
      'Initial hydration',
      'Palette open (median/5)',
      'Sidebar toggle (median/5)',
      'Session create (median/3)',
      'Tab switch (median/5)',
      'Keystroke → paint (median)',
    ];
    rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

    const md = renderReport(rows);
    await fs.promises.writeFile(path.join(ART, 'report.json'), JSON.stringify(rows, null, 2));
    await fs.promises.writeFile(path.join(ART, 'report.md'), md);
    console.log('\n' + md);
  });
});

function renderReport(rows: Result[]): string {
  const lines: string[] = [
    '# Clauditor perf report',
    '',
    '| Metric | Median | Samples | Budget (good / ok) | Grade |',
    '|--------|--------|---------|--------------------|-------|',
  ];
  for (const r of rows) {
    const icon = r.grade === 'good' ? '✅' : r.grade === 'ok' ? '🟡' : '🔴';
    const samples = r.samples.map((s) => s.toFixed(0)).join(', ');
    lines.push(
      `| ${r.name} | ${r.ms.toFixed(1)} ms | [${samples}] | ${r.budget.good} / ${r.budget.ok} ms | ${icon} ${r.grade} |`,
    );
  }
  lines.push(
    '',
    '## Reference budgets',
    '',
    '- **INP (good)** per Web Vitals: ≤ 200 ms — applied to palette / sidebar toggle.',
    '- **Tab switch**: desktop-editor convention (VS Code / Warp target) ≤ 50 ms good, ≤ 120 ms acceptable.',
    '- **Keystroke → paint**: terminal tools (Warp, Alacritty, kitty) target ≤ 16 ms (one frame at 60 Hz).',
    '- **Session create**: mock backend; real PTY adds ~50–200 ms.',
    '- **Hydration**: dev-server; production Tauri bundle usually 2–3× faster.',
    '',
    'Grades: ✅ good · 🟡 acceptable · 🔴 poor (blocking-feel territory).',
  );
  return lines.join('\n');
}
