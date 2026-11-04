import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { keepDataSafe } from './engine/db.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { captureInstallPrompt, rememberInstalled } from './lib/install.js';
import '@desktop/styles/print.css';
import './styles.css';

// Inside the Android app (lib/native.js): styles that leave the status bar to Android.
if (window.DOCGEN_NATIVE) document.documentElement.classList.add('docgen-native');
captureInstallPrompt();
keepDataSafe();
window.addEventListener('docgen-db-blocked', () =>
  window.alert('DocGen is being updated. Please close DocGen in your other tabs or windows to finish.'),
);

// Offline support: the service worker keeps the app on the phone after the first visit. Once installed, the app
// opens from the phone without asking the server; updates come from Settings → About → Update app.
// Not in the Android app: its files are inside the app already, and updates come from the Play Store.
if ('serviceWorker' in navigator && window.isSecureContext && !window.DOCGEN_NATIVE) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('/app/sw.js', { scope: '/app/' })
      .then(() => navigator.serviceWorker.ready)
      .then(rememberInstalled)
      .catch(() => {}),
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
