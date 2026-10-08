/**
 * The problems DocGen solves, shared by the home page ("Sound familiar?") and the /buy funnel.
 * Based on what small Indian businesses report about billing: slow handwritten bills, GST mistakes,
 * broken Excel templates, accounting software that is too much, apps that need internet, late payments.
 */

import Icon from '../../components/Icons.jsx';

/** [id, icon, problem, detail, how DocGen fixes it] */
export const PAINS = [
  [
    'slow',
    'clock',
    'Writing bills by hand takes too long',
    'A handwritten bill takes 3–5 minutes while the customer waits at the counter — and it still looks rough.',
    'A clean GST invoice in under a minute: pick the customer and items, DocGen fills in the rest.',
  ],
  [
    'gst',
    'rupee',
    'GST mistakes cost you money',
    'A wrong rate, CGST + SGST instead of IGST or a mistyped GSTIN means corrected bills, buyers who lose input tax credit, or a GST notice.',
    'GSTIN checked and state filled in, CGST + SGST or IGST chosen for you, HSN summary and amount in words on every invoice.',
  ],
  [
    'excel',
    'file',
    'Excel and Word templates keep breaking',
    'Retyping customer details every time, invoice numbers that skip or repeat, formulas someone overwrote.',
    'Saved customers and products, automatic numbering for every series and four ready-made professional templates.',
  ],
  [
    'complex',
    'settings',
    'Accounting software is more than you need',
    'Full accounting packages cost ₹20,000 or more or a monthly fee, and need training or an accountant to run.',
    'Made for billing, not bookkeeping. Learn it in 5 minutes and pay once for 1, 2 or 5 years — no monthly fee.',
  ],
  [
    'offline',
    'offline',
    'No internet, no billing',
    'Online billing apps stop when the network drops, and your business data sits on someone else’s server.',
    'Works fully offline. Your documents, customers and prices stay on your own computer and phone.',
  ],
  [
    'late',
    'chart',
    'Payments come late and bills get lost',
    'Small businesses wait more than two months on average to get paid, and paper bills are hard to find when you follow up.',
    'Track every invoice from draft to paid, find any bill in seconds, and print a UPI QR code so customers pay on the spot.',
  ],
  [
    'away',
    'phone',
    'Customers ask for a quote while you are out',
    'You promise to send it “in the evening” — and the order goes to someone faster.',
    'Make the quotation or invoice on your phone and share the PDF on WhatsApp right away.',
  ],
  [
    'ca',
    'users',
    'Your CA wants the bills every month',
    'Copying invoices into a sheet for GST returns takes hours and invites mistakes.',
    'Download your sales register in one click and send it to your CA.',
  ],
];

/** Home page: problem → fix cards. */
export function ProblemSection({ count = 6 }) {
  return (
    <section className="lp-section" id="problems" data-testid="problems">
      <div className="lp-head">
        <span className="lp-eyebrow">Sound familiar?</span>
        <h2 className="lp-title">Billing shouldn’t eat up your day</h2>
        <p className="lp-lead">What small shops, traders and service businesses tell us — and what DocGen does about it.</p>
      </div>
      <div className="problems">
        {PAINS.slice(0, count).map(([id, icon, problem, detail, fix]) => (
          <div key={id} className="problem-card" data-testid="problem-card">
            <div className="problem-top">
              <span className="problem-icon">
                <Icon name={icon} size={18} />
              </span>
              <div>
                <h3>{problem}</h3>
                <p>{detail}</p>
              </div>
            </div>
            <div className="problem-fix">
              <Icon name="check" size={15} strokeWidth={2.6} />
              <span>{fix}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
