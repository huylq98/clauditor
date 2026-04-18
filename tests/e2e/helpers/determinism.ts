import { browser } from '@wdio/globals';

export async function applyDeterminism(): Promise<void> {
  await browser.execute(() => {
    const style = document.createElement('style');
    style.id = 'e2e-determinism';
    style.textContent =
      '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }';
    document.head.appendChild(style);
  });
}
