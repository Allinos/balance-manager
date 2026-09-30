/**
 * Generate the Ed25519 key pair used to sign desktop licenses.
 *   - Keep the PRIVATE key secret: set it as LICENSE_PRIVATE_KEY on the server.
 *   - Put the PUBLIC key into document-generator/src-tauri/remote-config.json (licensePublicKey)
 *     before building the desktop installer.
 */
import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const der = publicKey.export({ type: 'spki', format: 'der' });
console.log('LICENSE_PRIVATE_KEY (server secret, one line):');
console.log(pem.trim().replace(/\n/g, '\\n'));
console.log('\nlicensePublicKey (desktop remote-config.json):');
console.log(der.subarray(der.length - 32).toString('base64'));
