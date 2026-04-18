export const SEL = {
  region: {
    titlebar: '[data-region="titlebar"]',
    sidebar: '[data-region="sidebar"]',
    tabbar: '[data-region="tabbar"]',
    terminal: '[data-region="terminal"]',
    statusbar: '[data-region="statusbar"]',
    overlay: '[data-region="overlay"]',
  },
  status: {
    tokens: '[data-testid="status-tokens"]',
    version: '[data-testid="status-version"]',
    connection: '[data-testid="status-connection"]',
    cwd: '[data-testid="status-cwd"]',
    kill: '[data-testid="status-kill"]',
  },
  newSessionBtn: 'button:has-text("New session")',
  paletteInput: '[placeholder*="Type a command"]',
  terminalHostByIdAttr: (id: string) => `[data-terminal-host="${id}"]`,
  allTerminalHosts: '[data-terminal-host]',
} as const;
