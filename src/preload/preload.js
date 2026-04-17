const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clauditor', {
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  createSession: (opts) => ipcRenderer.invoke('sessions:create', opts || {}),
  killSession: (id) => ipcRenderer.invoke('sessions:kill', id),
  renameSession: (id, name) => ipcRenderer.invoke('sessions:rename', id, name),
  write: (id, data) => ipcRenderer.invoke('sessions:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.invoke('sessions:resize', id, cols, rows),
  getBuffer: (id) => ipcRenderer.invoke('sessions:buffer', id),

  listTree: (sid, relPath) => ipcRenderer.invoke('tree:list', sid, relPath),
  readFile: (sid, relPath) => ipcRenderer.invoke('file:read', sid, relPath),
  getActivitySnapshot: (sid) => ipcRenderer.invoke('activity:snapshot', sid),

  onCreated: (cb) => ipcRenderer.on('session:created', (_e, s) => cb(s)),
  onData: (cb) => ipcRenderer.on('session:data', (_e, id, chunk) => cb(id, chunk)),
  onState: (cb) => ipcRenderer.on('session:state', (_e, id, state) => cb(id, state)),
  onExit: (cb) => ipcRenderer.on('session:exit', (_e, id, code) => cb(id, code)),
  onRenamed: (cb) => ipcRenderer.on('session:renamed', (_e, s) => cb(s)),
  onFocus: (cb) => ipcRenderer.on('session:focus', (_e, id) => cb(id)),
  onNewSessionRequest: (cb) => ipcRenderer.on('ui:new-session', () => cb()),
  onTreeEvent: (cb) => ipcRenderer.on('tree:event', (_e, sid, ev) => cb(sid, ev)),
  onActivityDelta: (cb) => ipcRenderer.on('activity:delta', (_e, sid, delta) => cb(sid, delta)),
});

if (process.env.CLAUDITOR_TEST === '1') {
  contextBridge.exposeInMainWorld('__clauditorTestBridge', {
    enabled: true,
    trayItems: () => ipcRenderer.invoke('__test:tray-items'),
  });
}
