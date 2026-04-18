import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';

export const terminalTheme: ITerminalOptions['theme'] = {
  background: '#14161b',
  foreground: '#c7c1b2',
  cursor: '#c98469',
  cursorAccent: '#14161b',
  selectionBackground: 'rgba(201, 132, 105, 0.24)',
  black: '#1a1d24',
  red: '#c98469',
  green: '#8ba668',
  yellow: '#c99d62',
  blue: '#7a97a6',
  magenta: '#a88ab4',
  cyan: '#6fa6a8',
  white: '#c7c1b2',
  brightBlack: '#5a564e',
  brightRed: '#d99a82',
  brightGreen: '#9cb87a',
  brightYellow: '#d4ab76',
  brightBlue: '#8fa8b6',
  brightMagenta: '#b79dc1',
  brightCyan: '#85b4b5',
  brightWhite: '#d6cdb8',
};

export interface TerminalBundle {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  dispose: () => void;
}

export function createTerminal(): TerminalBundle {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono NF", "JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
    fontSize: 13,
    lineHeight: 1.15,
    theme: terminalTheme,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    smoothScrollDuration: 0,
    macOptionIsMeta: true,
    minimumContrastRatio: 1,
    fastScrollModifier: 'shift',
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon());

  const dispose = () => {
    try {
      term.dispose();
    } catch {
      /* noop */
    }
  };

  return { term, fit, search, dispose };
}

export function tryEnableWebgl(term: Terminal) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch (e) {
    console.warn('webgl renderer unavailable:', e);
  }
}

export function probeDims(container?: HTMLElement): { cols: number; rows: number } {
  const target =
    container ??
    document.querySelector<HTMLElement>('[data-terminal-stage]') ??
    document.body;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;width:100%;height:100%;pointer-events:none;';
  target.appendChild(probe);
  const t = new Terminal({
    fontFamily: '"JetBrains Mono NF", "JetBrains Mono", "Cascadia Mono", monospace',
    fontSize: 13,
  });
  const fit = new FitAddon();
  t.loadAddon(fit);
  t.open(probe);
  let dims: { cols: number; rows: number } | undefined;
  try {
    const d = fit.proposeDimensions();
    if (d && d.cols) dims = { cols: d.cols, rows: d.rows };
  } catch {
    /* noop */
  }
  t.dispose();
  probe.remove();
  return dims ?? { cols: 180, rows: 45 };
}
