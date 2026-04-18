import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

declare global {
  interface Window {
    __test__?: {
      dumpFsm: (sessionId: string) => Promise<string | null>;
      listPids: () => Promise<number[]>;
      hookToken: () => Promise<string>;
      hookPort: () => Promise<number>;
    };
  }
}

if (import.meta.env.VITE_CLAUDITOR_TEST_HOOKS === '1') {
  void import('@tauri-apps/api/core').then(({ invoke }) => {
    window.__test__ = {
      dumpFsm: (sessionId) => invoke('dump_fsm', { sessionId }),
      listPids: () => invoke('list_pids'),
      hookToken: () => invoke('hook_token'),
      hookPort: () => invoke('hook_port_cmd'),
    };
  });
}
