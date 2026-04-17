const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');

const { PTYManager } = require('./pty-manager');
const { StateEngine } = require('./state-engine');
const { HookServer } = require('./hook-server');
const { Notifier } = require('./notifier');
const { TrayController } = require('./tray');
const settingsInstaller = require('./settings-installer');

const TOKEN = crypto.randomBytes(24).toString('hex');
process.env.CLAUDITOR_TOKEN = TOKEN;

let mainWindow = null;
let tray = null;
let ptyManager = null;
let stateEngine = null;
let hookServer = null;
let notifier = null;
let quitting = false;

function broadcast(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function createWindow() {
  const isTest = process.env.CLAUDITOR_TEST === '1';
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 900,
    minHeight: 500,
    title: 'Clauditor',
    backgroundColor: '#1e1e2e',
    show: !isTest,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (!isTest) mainWindow.once('ready-to-show', () => mainWindow.maximize());
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function focusSession(id) {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
  broadcast('session:focus', id);
}

function pushTrayUpdate() {
  tray?.update(ptyManager.list(), stateEngine.all());
}

async function bootstrap() {
  ptyManager = new PTYManager({ token: TOKEN });
  stateEngine = new StateEngine();
  hookServer = new HookServer({ token: TOKEN, stateEngine, ptyManager });
  await hookServer.start();

  settingsInstaller.install();

  notifier = new Notifier({ onClick: focusSession });

  ptyManager.on('spawn', (session) => {
    stateEngine.register(session.id);
    broadcast('session:created', session);
    pushTrayUpdate();
  });
  ptyManager.on('data', (id, chunk) => broadcast('session:data', id, chunk));
  ptyManager.on('rename', (session) => { broadcast('session:renamed', session); pushTrayUpdate(); });
  ptyManager.on('exit', (id, code) => {
    stateEngine.markExited(id);
    broadcast('session:exit', id, code);
  });

  stateEngine.on('change', (id, next) => {
    broadcast('session:state', id, next);
    pushTrayUpdate();
    const session = ptyManager.describe(id) || { name: `session-${id.slice(0, 6)}` };
    notifier.notify(id, next, session);
  });

  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  tray = new TrayController({
    iconPath,
    onShow: () => { if (!mainWindow) createWindow(); mainWindow.show(); mainWindow.focus(); },
    onNewSession: () => { focusSession(null); broadcast('ui:new-session'); },
    onFocusSession: focusSession,
    onQuit: () => { quitting = true; app.quit(); },
  });
  tray.start();

  if (process.env.CLAUDITOR_TEST === '1') {
    ipcMain.handle('__test:tray-items', () => tray.menuLabels?.() || []);
  }
}

ipcMain.handle('sessions:list', () => {
  return ptyManager.list().map((s) => ({ ...s, state: stateEngine.get(s.id) }));
});

ipcMain.handle('sessions:create', async (_e, { cwd, name, cols, rows } = {}) => {
  let chosenCwd = cwd;
  if (!chosenCwd) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose working directory for Claude session',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    chosenCwd = result.filePaths[0];
  }
  try {
    return ptyManager.spawn({ cwd: chosenCwd, name, cols, rows });
  } catch (err) {
    console.error('[clauditor] spawn failed:', err);
    dialog.showErrorBox('Failed to start Claude Code', err.message);
    return null;
  }
});

ipcMain.handle('sessions:kill', (_e, id) => { ptyManager.kill(id); return true; });
ipcMain.handle('sessions:rename', (_e, id, name) => ptyManager.rename(id, name));
ipcMain.handle('sessions:write', (_e, id, data) => { ptyManager.write(id, data); return true; });
ipcMain.handle('sessions:resize', (_e, id, cols, rows) => { ptyManager.resize(id, cols, rows); return true; });
ipcMain.handle('sessions:buffer', (_e, id) => ptyManager.getBuffer(id));

app.whenReady().then(async () => {
  await bootstrap();
  createWindow();
});

app.on('window-all-closed', (e) => {
  // keep running in tray
  e.preventDefault?.();
});

app.on('before-quit', async (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  try {
    settingsInstaller.uninstall();
    ptyManager?.killAll();
    await hookServer?.stop();
    tray?.destroy();
  } finally {
    app.exit(0);
  }
});
