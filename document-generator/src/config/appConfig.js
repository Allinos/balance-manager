/**
 * Product branding and support details. Edit these values before building your installer.
 *
 * Icons: `public/brand-icon.png` (sidebar, setup) and `assets/app-icon.png` (1024 px master for
 * the installer/app icons: `npx tauri icon assets/app-icon.png -o src-tauri/icons`).
 * The name is shown as two colours: "Doc" (brand blue) + "Gen" (brand orange), see BrandName.jsx.
 */
export const APP_CONFIG = {
  appName: 'DocGen',
  tagline: 'Create. Manage. Grow.',
  iconUrl: '/brand-icon.png',
  company: 'reynrel.in',
  companyUrl: 'https://reynrel.in',
  website: 'https://reynrel.in',
  supportEmail: 'info.reynrel@gmail.com',
  supportPhone: '+91 90000 00000',
  // International format without "+" or spaces, used for https://wa.me/<number>
  whatsappNumber: '919000000000',
  youtubeChannel: 'https://www.youtube.com/@reynrel',
  premiumFeatures: [
    'All document types and templates, no ads',
    'Use on more than one computer',
    'Priority email & WhatsApp support',
    'Help with setup, backup and data migration',
  ],
};
