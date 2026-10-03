/** "Install app" support: keeps the browser's install prompt (Android Chrome) until the user asks for it. */

let deferred = null;
const listeners = new Set();

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const canPrompt = () => !!deferred;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const onInstallChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Shows the system install dialog. Resolves true when accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}
