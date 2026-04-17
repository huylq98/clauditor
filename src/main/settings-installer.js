const fs = require('fs');
const path = require('path');
const os = require('os');

const SENTINEL = '_clauditor';
const EVENTS = {
  UserPromptSubmit: 'user-prompt-submit',
  PreToolUse: 'pre-tool-use',
  PostToolUse: 'post-tool-use',
  Stop: 'stop',
  Notification: 'notification',
};

function claudeDir() { return path.join(os.homedir(), '.claude'); }
function settingsPath() { return path.join(claudeDir(), 'settings.json'); }
function hookScriptPath() {
  return path.join(claudeDir(), process.platform === 'win32' ? 'clauditor-hook.ps1' : 'clauditor-hook.sh');
}

const PS1 = `param([string]$Endpoint)
if (-not $env:CLAUDITOR_TOKEN) { exit 0 }
try {
  $body = [Console]::In.ReadToEnd()
  if (-not $body) { $body = "{}" }
  try { $json = $body | ConvertFrom-Json } catch { $json = @{} }
  $json | Add-Member -NotePropertyName clauditor_session_id -NotePropertyValue $env:CLAUDITOR_SESSION_ID -Force
  $out = $json | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "http://127.0.0.1:27182/hook/$Endpoint" \`
    -Method Post \`
    -Headers @{ "X-Clauditor-Token" = $env:CLAUDITOR_TOKEN; "Content-Type" = "application/json" } \`
    -Body $out -TimeoutSec 2 -ErrorAction Stop | Out-Null
} catch {}
exit 0
`;

const SH = `#!/bin/sh
[ -z "$CLAUDITOR_TOKEN" ] && exit 0
BODY=$(cat)
[ -z "$BODY" ] && BODY="{}"
PAYLOAD=$(printf '%s' "$BODY" | sed -e "s/}$/,\\"clauditor_session_id\\":\\"$CLAUDITOR_SESSION_ID\\"}/")
curl -s -m 2 -X POST \\
  -H "Content-Type: application/json" \\
  -H "X-Clauditor-Token: $CLAUDITOR_TOKEN" \\
  -d "$PAYLOAD" \\
  "http://127.0.0.1:27182/hook/$1" >/dev/null 2>&1
exit 0
`;

function writeHookScript() {
  fs.mkdirSync(claudeDir(), { recursive: true });
  const p = hookScriptPath();
  const content = process.platform === 'win32' ? PS1 : SH;
  fs.writeFileSync(p, content);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(p, 0o755); } catch {}
  }
  return p;
}

function buildCommand(endpoint) {
  const script = hookScriptPath();
  if (process.platform === 'win32') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" ${endpoint}`;
  }
  return `sh "${script}" ${endpoint}`;
}

function install() {
  writeHookScript();
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let settings = {};
  if (fs.existsSync(p)) {
    try { settings = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { settings = {}; }
  }
  settings.hooks = settings.hooks || {};

  for (const [event, endpoint] of Object.entries(EVENTS)) {
    const existing = settings.hooks[event] || [];
    const filtered = existing.filter((group) => !group[SENTINEL]);
    filtered.push({
      [SENTINEL]: true,
      hooks: [{ type: 'command', command: buildCommand(endpoint) }],
    });
    settings.hooks[event] = filtered;
  }

  fs.writeFileSync(p, JSON.stringify(settings, null, 2));
  return p;
}

function uninstall() {
  const p = settingsPath();
  if (!fs.existsSync(p)) return;
  let settings;
  try { settings = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return; }
  if (!settings.hooks) return;
  for (const event of Object.keys(EVENTS)) {
    if (!settings.hooks[event]) continue;
    settings.hooks[event] = settings.hooks[event].filter((g) => !g[SENTINEL]);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  fs.writeFileSync(p, JSON.stringify(settings, null, 2));
  try { fs.unlinkSync(hookScriptPath()); } catch {}
}

module.exports = { install, uninstall, settingsPath };
