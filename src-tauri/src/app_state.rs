use crate::activity_service::ActivityService;
use crate::file_watcher::FileWatcher;
use crate::preferences_store::PreferencesStore;
use crate::pty_manager::PtyManager;
use crate::session_store::SessionStore;
use crate::state_engine::StateEngine;

#[derive(Clone)]
pub struct AppState {
    pub pty: PtyManager,
    pub engine: StateEngine,
    pub watcher: FileWatcher,
    pub activity: ActivityService,
    pub store: SessionStore,
    pub token: String,
    pub prefs: PreferencesStore,
}
