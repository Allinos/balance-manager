/**
 * Dashboard → Share (desktop and mobile): a promotional message with DocGen's download links for the computer and the
 * phone, to send on WhatsApp, by email or anywhere. Personal referral codes are only for authorised partners
 * (website → Partners), so customers share the plain website links.
 */

/** The website (computer download) and the phone app page. `base`: the DocGen website address. */
export function shareLinksFor(license, fallbackUrl) {
  const base = String(license?.portalUrl || license?.websiteUrl || fallbackUrl || '').replace(/\/+$/, '');
  return { link: `${base}/`, mobileLink: `${base}/mobile` };
}

export const promoMessage = ({ link, mobileLink }) =>
  `Make GST invoices, quotations, delivery challans and receipts in seconds with DocGen — professional templates, works offline on your computer and phone.\n\nDownload for computer: ${link}\nOn your phone: ${mobileLink}`;

export const whatsappShareUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const emailShareUrl = (text) => `mailto:?subject=${encodeURIComponent('Try DocGen for your invoices')}&body=${encodeURIComponent(text)}`;

/** Copy text; falls back to a hidden text field where the Clipboard API is not allowed. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
