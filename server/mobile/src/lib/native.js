/**
 * DocGen for Android: the Flutter app (android-app/) runs this same web app offline inside a WebView and
 * adds what a browser cannot do. The Flutter side sets `window.DOCGEN_NATIVE` before the page loads:
 *   { platform: 'android', version, server: 'https://…' (the DocGen server for licenses and upgrades) }
 * and answers these bridge calls (flutter_inappwebview handlers, see android-app/lib/bridge.dart):
 *   account.get / account.create {name, business, phone, pin} / account.login {phone, pin} / account.upgraded {licenseKey}
 *   pin.get → {enabled, saved, digits} / pin.set {current, pin} / pin.resume {pin} / pin.disable {pin}
 *   sms.send {phone, text}  → {sent: true} | {sent: false, reason}
 *   open {url}              → WhatsApp, the website, email … in the phone's own apps
 *   file.share / file.save {name, mime, base64, text?}
 *   screen {path, free}     → the native ad banner (free plan only, list screens only)
 *   event {name}            → 'doc_saved' may show a rare full-screen ad to free users
 * In a normal browser (the PWA) none of this exists and every helper falls back to the web behaviour.
 */

export const native = () => typeof window !== 'undefined' && !!window.DOCGEN_NATIVE;

/** The DocGen server: the page's own origin in the browser, the configured server in the Android app. */
export const serverUrl = () => (native() ? String(window.DOCGEN_NATIVE.server || '').replace(/\/+$/, '') : '');

let ready;
const bridgeReady = () => {
  if (!ready) {
    ready = new Promise((resolve) => {
      if (window.flutter_inappwebview?.callHandler) return resolve();
      window.addEventListener('flutterInAppWebViewPlatformReady', () => resolve(), { once: true });
      // Never hang the app if the bridge does not come up.
      setTimeout(resolve, 3000);
    });
  }
  return ready;
};

/** Call the Flutter side; resolves null outside the Android app or when the handler is missing. */
export async function bridge(name, args = {}) {
  if (!native()) return null;
  await bridgeReady();
  const call = window.flutter_inappwebview?.callHandler;
  if (!call) return null;
  try {
    return (await call.call(window.flutter_inappwebview, name, args)) ?? null;
  } catch {
    return null;
  }
}

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(blob);
  });

/** Save (Downloads) or share (WhatsApp, email …) a file through Android. Returns false outside the app. */
export async function nativeFile(kind, blob, name, text = '') {
  if (!native()) return false;
  const res = await bridge(kind === 'share' ? 'file.share' : 'file.save', { name, mime: blob.type || 'application/octet-stream', base64: await toBase64(blob), text });
  return !!res?.ok;
}

/** Open a link in the phone's apps (WhatsApp, browser, email); in the browser a new tab. */
export function openLink(url) {
  if (native()) return bridge('open', { url });
  const win = window.open(url, '_blank', 'noopener');
  if (!win) window.location.href = url;
  return null;
}

/** Tell the Android app which screen is showing (ad banner on list screens for free users). */
export const reportScreen = (path, free) => (native() ? bridge('screen', { path, free: !!free }) : null);
export const reportEvent = (name) => (native() ? bridge('event', { name }) : null);
