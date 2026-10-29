/**
 * DocGen Partner Programme — Terms & Conditions. The version must match PARTNER_TERMS_VERSION in
 * backend/src/services/partners.js: when the text changes, raise both, and every partner accepts again.
 */

export const PARTNER_TERMS_VERSION = '2026-10';
export const PARTNER_TERMS_UPDATED = '29 October 2026';
export const PAYOUT_MINIMUM = 500;
export const HOLD_DAYS = 15;

/** The terms. `b`: business details (legal name, court city, email) from Admin → Website. */
export function PartnerTermsContent({ b }) {
  const court = b.jurisdiction ? `the courts at ${b.jurisdiction}, India` : 'the courts having jurisdiction over our place of business in India';
  return (
    <>
      <p>
        These terms govern the DocGen Partner Programme (the &quot;Programme&quot;) run by {b.legalName} (&quot;we&quot;, &quot;us&quot;). By applying, or by
        using your partner account, link or code, you (&quot;Partner&quot;) agree to them. Please read them carefully.
      </p>

      <h2>1. Eligibility</h2>
      <ul>
        <li>You are at least 18 years old and able to enter into a contract, or a business registered in India acting through an authorised person.</li>
        <li>You have a PAN, and a bank account or UPI ID in your (or your business&apos;s) name, to receive payouts.</li>
        <li>One partner account per person or business. Our employees and their immediate family members are not eligible.</li>
        <li>You have not been removed from the Programme before.</li>
      </ul>

      <h2>2. Application and approval</h2>
      <ul>
        <li>You apply on the Partnership page. We review every application and may approve or decline it at our discretion, without giving reasons.</li>
        <li>Only an approved partner receives a referral link and code and can earn commissions. Your account and code are personal: do not share your login.</li>
      </ul>

      <h2>3. Referral rules</h2>
      <ul>
        <li>A customer counts as referred by you when they open your link (or enter the site with your code) and then register or buy within 30 days.</li>
        <li>Each customer is credited to one partner only: the first partner whose link they used, recorded on our server when they register or buy.</li>
        <li>Only new customers count: someone who had already bought DocGen before using your link is not credited to you.</li>
        <li>You cannot refer yourself, your own business or accounts you control. Purchases with your own email or details earn no commission.</li>
        <li>Our records (server logs, registrations and payments) decide whether a customer was referred by you.</li>
      </ul>

      <h2>4. Commission calculation</h2>
      <ul>
        <li>You earn a commission on each successful payment made by a customer you referred, including their renewals, while your partnership is active.</li>
        <li>
          The commission is your commission percentage of the amount the customer actually paid for the license (after any discount). Your percentage is
          set individually and shown in your dashboard. A change of percentage applies to payments made after the change.
        </li>
        <li>Each payment earns one commission only. Failed, cancelled, pending, test or free orders earn nothing.</li>
        <li>Amounts are calculated in Indian Rupees and rounded to the nearest paisa.</li>
      </ul>

      <h2>5. Payment schedule</h2>
      <ul>
        <li>A new commission is pending for {HOLD_DAYS} days (our refund period plus processing). After that it is approved for payout unless it is reversed.</li>
        <li>
          Approved commissions are paid once a month, by the 10th of the following month, by bank transfer or UPI, when your approved balance is at least ₹
          {PAYOUT_MINIMUM}. A smaller balance is carried forward.
        </li>
        <li>Tax is deducted at source (TDS) as required by law. If you are registered for GST, send us a valid tax invoice for each payout.</li>
        <li>Each payout shows its reference (UTR / transaction ID) in your dashboard. Report any mistake within 30 days of the payout.</li>
      </ul>

      <h2>6. Refunds and payment reversals</h2>
      <ul>
        <li>If a referred payment is refunded, charged back or reversed, its commission is reversed.</li>
        <li>If that commission was already paid, the amount is deducted from your next payouts.</li>
      </ul>

      <h2>7. Fraud prevention and prohibited practices</h2>
      <p>You must promote DocGen honestly. You must not:</p>
      <ul>
        <li>send spam (unsolicited bulk email, SMS or WhatsApp messages) or post your link where it is not allowed;</li>
        <li>make false or misleading claims about DocGen, its prices or features, or offer discounts or cashback we have not approved;</li>
        <li>pretend to be DocGen or {b.legalName}, use our name or logo in a way that confuses people, or bid on our brand name in search ads;</li>
        <li>create fake accounts, use other people&apos;s details, buy through your own link, or pay people to sign up;</li>
        <li>force or hide clicks on your link (cookie stuffing, pop-ups, invisible frames) or use any automated or deceptive method.</li>
      </ul>
      <p>
        We may review any activity. If we find a breach or suspect fraud, we may hold or cancel the commissions involved, reverse commissions already paid,
        suspend your account while we investigate, and end your partnership.
      </p>

      <h2>8. Use of our brand</h2>
      <ul>
        <li>You may use the DocGen name, screenshots and materials we provide only to promote DocGen under these terms, and must stop when the partnership ends.</li>
        <li>You are an independent partner, not our employee, agent or representative, and cannot make promises or contracts on our behalf.</li>
      </ul>

      <h2>9. Customer data</h2>
      <ul>
        <li>Your dashboard shows only what you need to follow your referrals; customer names may be masked. Use any customer information only for this Programme.</li>
        <li>Customers buy from us, under our Terms & Conditions and Privacy Policy. Support and refunds are handled by us.</li>
      </ul>

      <h2>10. Suspension and termination</h2>
      <ul>
        <li>You may leave the Programme at any time by writing to us. We may end the Programme or your partnership with 30 days&apos; notice.</li>
        <li>We may suspend or end your partnership immediately for a breach of these terms, suspected fraud, or conduct that harms our reputation.</li>
        <li>
          When a partnership ends, your link stops crediting new customers. Valid approved commissions are paid in the next payout cycle, except
          commissions held or cancelled under section 7.
        </li>
      </ul>

      <h2>11. Changes to these terms</h2>
      <p>
        We may change these terms. The new version is published on this page with a new date; you are asked to accept it when you next sign in, and must
        accept it to keep using the Programme. We record the version you accepted and when.
      </p>

      <h2>12. Liability and law</h2>
      <ul>
        <li>
          Our total liability to you under the Programme is limited to the commissions due to you for the three months before a claim. We are not liable for
          indirect losses or lost profits.
        </li>
        <li>These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of {court}.</li>
      </ul>

      <h2>13. Contact</h2>
      <p>
        Questions about the Programme: <a href={`mailto:${b.email}`}>{b.email}</a>.
      </p>
    </>
  );
}
