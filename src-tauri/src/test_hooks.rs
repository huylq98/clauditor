//! Test-only seams. Compiled only when the `test-hooks` feature is enabled.
//! NEVER include in release builds — see CI guard in .github/workflows/release.yml.

use std::time::Duration;

use crate::types::{SessionId, SessionState};

const DEFAULT_IDLE_MS: u64 = 5 * 60 * 1000;
const DEFAULT_STOP_MS: u64 = 1500;
pub const DEFAULT_HOOK_PORT: u16 = 27182;

pub fn idle_timeout() -> Duration {
    let ms = std::env::var("CLAUDITOR_TEST_IDLE_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_IDLE_MS);
    Duration::from_millis(ms)
}

pub fn stop_grace() -> Duration {
    let ms = std::env::var("CLAUDITOR_TEST_STOP_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_STOP_MS);
    Duration::from_millis(ms)
}

pub fn hook_port() -> u16 {
    std::env::var("CLAUDITOR_TEST_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(DEFAULT_HOOK_PORT)
}

#[tauri::command]
pub fn dump_fsm(
    session_id: SessionId,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Option<SessionState> {
    state.engine.snapshot(&session_id)
}

#[tauri::command]
pub fn list_pids(state: tauri::State<'_, crate::app_state::AppState>) -> Vec<u32> {
    state.pty.child_pids()
}

#[tauri::command]
pub fn hook_token(state: tauri::State<'_, crate::app_state::AppState>) -> String {
    state.token.clone()
}

#[tauri::command]
pub fn hook_port_cmd() -> u16 {
    hook_port()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static IDLE_ENV: Mutex<()> = Mutex::new(());
    static STOP_ENV: Mutex<()> = Mutex::new(());
    static PORT_ENV: Mutex<()> = Mutex::new(());

    #[test]
    fn idle_timeout_default_5min() {
        let _g = IDLE_ENV.lock().unwrap();
        std::env::remove_var("CLAUDITOR_TEST_IDLE_MS");
        assert_eq!(idle_timeout(), Duration::from_millis(5 * 60 * 1000));
    }

    #[test]
    fn idle_timeout_env_override() {
        let _g = IDLE_ENV.lock().unwrap();
        std::env::set_var("CLAUDITOR_TEST_IDLE_MS", "2000");
        assert_eq!(idle_timeout(), Duration::from_millis(2000));
        std::env::remove_var("CLAUDITOR_TEST_IDLE_MS");
    }

    #[test]
    fn stop_grace_default_1500ms() {
        let _g = STOP_ENV.lock().unwrap();
        std::env::remove_var("CLAUDITOR_TEST_STOP_MS");
        assert_eq!(stop_grace(), Duration::from_millis(1500));
    }

    #[test]
    fn stop_grace_env_override() {
        let _g = STOP_ENV.lock().unwrap();
        std::env::set_var("CLAUDITOR_TEST_STOP_MS", "750");
        assert_eq!(stop_grace(), Duration::from_millis(750));
        std::env::remove_var("CLAUDITOR_TEST_STOP_MS");
    }

    #[test]
    fn hook_port_default_27182() {
        let _g = PORT_ENV.lock().unwrap();
        std::env::remove_var("CLAUDITOR_TEST_PORT");
        assert_eq!(hook_port(), 27182);
    }

    #[test]
    fn hook_port_env_override() {
        let _g = PORT_ENV.lock().unwrap();
        std::env::set_var("CLAUDITOR_TEST_PORT", "47000");
        assert_eq!(hook_port(), 47000);
        std::env::remove_var("CLAUDITOR_TEST_PORT");
    }
}
