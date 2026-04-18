; Clauditor uninstall hook — runs before files are removed.
; Always invokes `clauditor.exe --cleanup` to strip hook entries from
; ~/.claude/settings.json and delete the hook script. Also prompts the user
; whether to wipe Clauditor's app data (session list, recent folders).
; Silent uninstalls default to "preserve" via /SD IDNO.

!macro NSIS_HOOK_PREUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also remove your Clauditor settings and session history?$\r$\n$\r$\nThis clears the recent-folder list and saved session metadata under %APPDATA%\dev.clauditor.app." \
    /SD IDNO \
    IDYES __clauditor_purge \
    IDNO __clauditor_preserve
  __clauditor_purge:
    ExecWait '"$INSTDIR\clauditor.exe" --cleanup --purge'
    Goto __clauditor_done
  __clauditor_preserve:
    ExecWait '"$INSTDIR\clauditor.exe" --cleanup'
  __clauditor_done:
!macroend
