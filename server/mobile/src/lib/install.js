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

/** Ask the service worker to do something and wait for its answer. */
async function swMessage(type, timeoutMs = 30000) {
  if (!('serviceWorker' in navigator)) throw new Error('This browser cannot keep the app on the phone.');
  const reg = await navigator.serviceWorker.getRegistration('/app/');
  const worker = navigator.serviceWorker.controller || reg?.active;
  if (!worker) throw new Error('The app is not saved on this phone yet.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('The update took too long. Please try again.')), timeoutMs);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      if (e.data?.ok) resolve(e.data);
      else reject(new Error(e.data?.error || 'The update failed.'));
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

/** Opened from the home screen: from now on the app opens from the phone, with no request to the server. */
export function rememberInstalled() {
  if (isInstalled()) swMessage('installed').catch(() => {});
}

/**
 * Settings → About → Update app: fetch the newest version from the server and restart with it.
 * The installed app never does this on its own when opened.
 */
export async function updateApp() {
  if (navigator.onLine === false) throw new Error('You are offline. Connect to the internet to update the app.');
  const reg = await navigator.serviceWorker?.getRegistration('/app/');
  if (reg) {
    await reg.update().catch(() => {});
    try {
      await swMessage('update');
    } catch (e) {
      throw new Error(`The app could not be updated: ${e.message}`);
    }
  }
  window.location.reload();
}
