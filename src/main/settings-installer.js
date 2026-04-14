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

function settingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function buildCommand(endpoint, token) {
  const url = `http://127.0.0.1:27182/hook/${endpoint}`;
  if (process.platform === 'win32') {
    // Windows: read stdin, inject CLAUDITOR_SESSION_ID env, POST via curl
    return `powershell -NoProfile -Command "$input | & { $body = $input | Out-String; if (-not $body) { $body = '{}' }; try { $json = $body | ConvertFrom-Json } catch { $json = @{} }; $json | Add-Member -NotePropertyName clauditor_session_id -NotePropertyValue $env:CLAUDITOR_SESSION_ID -Force; $out = $json | ConvertTo-Json -Compress; Invoke-RestMethod -Uri '${url}' -Method Post -Headers @{ 'X-Clauditor-Token' = $env:CLAUDITOR_TOKEN; 'Content-Type' = 'application/json' } -Body $out | Out-Null }"`;
  }
  return `sh -c 'BODY=$(cat); [ -z "$BODY" ] && BODY="{}"; curl -s -X POST -H "Content-Type: application/json" -H "X-Clauditor-Token: $CLAUDITOR_TOKEN" -d "$(printf "%s" "$BODY" | sed -e "s/}$/,\\"clauditor_session_id\\":\\"$CLAUDITOR_SESSION_ID\\"}/")" ${url} >/dev/null'`;
}

function install(token) {
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
      hooks: [{ type: 'command', command: buildCommand(endpoint, token) }],
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
}

module.exports = { install, uninstall, settingsPath };
