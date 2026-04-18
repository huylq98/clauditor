import { browser } from '@wdio/globals';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { platform } from 'node:os';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import ssim from 'ssim.js';

const root = resolve(__dirname, '..');
const platformDir = platform() === 'win32' ? 'windows' : 'linux';
const baseDir = join(root, 'visual/baseline', platformDir);
const artifactDir = resolve(__dirname, '../../artifacts/visual');

export interface VisualResult { ssim: number; pixelDiffRatio: number; pass: boolean; }

export async function expectVisualMatch(name: string): Promise<VisualResult> {
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true });
  const actualB64 = await browser.takeScreenshot();
  const actual = PNG.sync.read(Buffer.from(actualB64, 'base64'));
  const baselinePath = join(baseDir, `${name}.png`);
  if (process.env.UPDATE_BASELINES === '1' || !existsSync(baselinePath)) {
    if (!existsSync(dirname(baselinePath))) mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, PNG.sync.write(actual));
    return { ssim: 1, pixelDiffRatio: 0, pass: true };
  }
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    writeFileSync(join(artifactDir, `${name}.actual.png`), PNG.sync.write(actual));
    throw new Error(`visual: dimension mismatch for ${name}: baseline ${baseline.width}x${baseline.height} vs actual ${actual.width}x${actual.height}`);
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const differing = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
  const pixelDiffRatio = differing / (baseline.width * baseline.height);
  const ssimScore = ssim(
    { data: baseline.data as unknown as Uint8ClampedArray, width: baseline.width, height: baseline.height },
    { data: actual.data as unknown as Uint8ClampedArray, width: actual.width, height: actual.height }
  ).mssim;
  const pass = ssimScore >= 0.99 && pixelDiffRatio <= 0.002;
  if (!pass) {
    writeFileSync(join(artifactDir, `${name}.actual.png`), PNG.sync.write(actual));
    writeFileSync(join(artifactDir, `${name}.diff.png`), PNG.sync.write(diff));
  }
  return { ssim: ssimScore, pixelDiffRatio, pass };
}
