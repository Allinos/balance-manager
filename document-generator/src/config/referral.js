/**
 * Referral sharing (Dashboard → Share, desktop and mobile). The link is the customer's own, from the server
 * with their license (<website>/r/<code>); friends who buy through it within 30 days are credited to them.
 * Without a signed-in account (trial, or a code-only license) the website link is shared instead.
 */

export const referralMessage = (link) => `I make my GST invoices, quotations and receipts with DocGen — quick and easy. Try it: ${link}`;

export const whatsappShareUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const emailShareUrl = (text) => `mailto:?subject=${encodeURIComponent('Try DocGen for your invoices')}&body=${encodeURIComponent(text)}`;

/** { link, code, personal } for the Share dialog. */
export function referralFor(license, fallbackUrl) {
  const link = license?.referral?.link;
  if (link) return { link, code: license.referral.code || '', personal: true };
  return { link: license?.websiteUrl || license?.portalUrl || fallbackUrl, code: '', personal: false };
}

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
