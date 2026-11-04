/**
 * Free plan of DocGen for Android: every feature can be used without a license, up to
 *   20 documents (bills, quotations, orders …), 20 payments (receipts / payment vouchers) and
 *   20 customers & vendors.
 * With a license (Settings → Plan & Account → Upgrade) there are no limits and no ads.
 * The browser app (PWA) always needs a license, so the free plan exists only in the Android app.
 */

export const FREE_LIMITS = { documents: 20, payments: 20, parties: 20 };
/** Payments on the free plan: receipts, payment vouchers and the ledger's Given / Received entries. */
export const PAYMENT_TYPES = new Set(['PAYMENT_RECEIPT', 'PAYMENT_VOUCHER', 'LEDGER_ENTRY']);

let free = false;
export const setFreePlan = (on) => {
  free = !!on;
};
export const isFreePlan = () => free;

export const LIMIT_TEXT = {
  documents: `The free plan includes ${FREE_LIMITS.documents} documents.`,
  payments: `The free plan includes ${FREE_LIMITS.payments} payments.`,
  parties: `The free plan includes ${FREE_LIMITS.parties} customers & vendors.`,
};

/** The message for a reached limit (the screens offer "Upgrade" when they see it). */
export const limitMessage = (what) => `${LIMIT_TEXT[what]} Upgrade to add more — your data stays on this phone.`;
export const isLimitError = (e) => String(e?.message || e || '').includes('free plan includes');
/** Which limit an error is about: 'documents', 'payments', 'parties' or ''. */
export const limitOf = (e) => {
  const m = String(e?.message || e || '');
  return Object.keys(LIMIT_TEXT).find((k) => m.includes(LIMIT_TEXT[k])) || '';
};

/**
 * Extra places earned by watching a rewarded ad (Android app): one ad = one more document (or payment).
 * Kept in the settings as freeBonus: { documents, payments } — a total, so a place is "used" by saving.
 */
export const BONUS_SETTING = 'freeBonus';
export const bonusOf = (value) => ({ documents: Math.max(0, Number(value?.documents) || 0), payments: Math.max(0, Number(value?.payments) || 0) });
/** The limit including earned places. */
export const limitWith = (what, bonus) => FREE_LIMITS[what] + (what === 'parties' ? 0 : bonusOf(bonus)[what]);

/** What is used of the free plan, from the stored documents and parties. */
export function usageOf(documents, parties) {
  const live = documents.filter((d) => !d.deleted_at && !d.is_demo);
  return {
    documents: live.filter((d) => !PAYMENT_TYPES.has(d.document_type)).length,
    payments: live.filter((d) => PAYMENT_TYPES.has(d.document_type)).length,
    parties: parties.filter((p) => !p.is_demo).length,
  };
}
