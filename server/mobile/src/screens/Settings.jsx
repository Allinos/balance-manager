/** Settings: the desktop's sections, one screen each. */

import Icon from '../components/Icon.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
import { Header, go } from '../components/ui.jsx';
import { CompanySection, DocumentTypesSection, DocumentsSection } from './settings/business.jsx';
import { AboutSection, BackupSection, HelpSection, LicenseSection, NumberingSection, TaxSection } from './settings/system.jsx';
import { useApp } from '../data.jsx';
import { PartyModulesSection } from './Parties.jsx';
import { PlanSection, PrinterSection, SecuritySection } from './Android.jsx';
import { native } from '../lib/native.js';

export const SECTIONS = [
  { id: 'company', label: 'Company', icon: 'building', detail: 'Name, address, GSTIN, logo, bank & UPI', Component: CompanySection },
  { id: 'documents', label: 'Documents', icon: 'documents', detail: 'Template, copies, colour, what is printed', Component: DocumentsSection },
  { id: 'types', label: 'Document Types', icon: 'layers', detail: 'Title, template and terms per type', Component: DocumentTypesSection },
  { id: 'tax', label: 'Tax', icon: 'percent', detail: 'GST / VAT, rates', Component: TaxSection },
  { id: 'numbering', label: 'Numbering', icon: 'hash', detail: 'Prefix, format, next number', Component: NumberingSection },
  { id: 'parties', label: 'Features', icon: 'grid', detail: 'Customers & Vendors and more, off by default', Component: PartyModulesSection },
  { id: 'license', label: 'License & Account', icon: 'key', detail: 'Key, validity, sign out', Component: LicenseSection },
  { id: 'backup', label: 'Backup', icon: 'database', detail: 'Save or restore all data', Component: BackupSection },
  { id: 'help', label: 'Help & Support', icon: 'help', detail: 'Guides, questions, contact', Component: HelpSection },
  { id: 'about', label: 'About', icon: 'info', detail: 'Version, privacy', Component: AboutSection },
];

/** Android app: Plan & Account (free plan, upgrade) instead of License, and Security (PIN lock). */
const ANDROID_SECTIONS = [
  { id: 'plan', label: 'Plan & Account', icon: 'crown', detail: 'Free plan, upgrade, your account', Component: PlanSection },
  { id: 'security', label: 'Security', icon: 'lock', detail: 'PIN lock when DocGen opens', Component: SecuritySection },
  { id: 'printer', label: 'Printer', icon: 'printer', detail: 'Bluetooth thermal printer for receipts', Component: PrinterSection },
];
export const sectionsFor = (android = native()) =>
  android ? SECTIONS.flatMap((s) => (s.id === 'license' ? ANDROID_SECTIONS : [s])) : SECTIONS;

export function SettingsSection({ id }) {
  const sections = sectionsFor();
  const section = sections.find((s) => s.id === id) || sections[0];
  const { Component } = section;
  return (
    <>
      <Header title={section.label} onBack={() => go('/settings')} />
      <Component />
    </>
  );
}

export default function Settings() {
  const { company, lic } = useApp();
  return (
    <>
      <Header title="Settings" />
      <div className="page" data-testid="settings">
        {!native() && <InstallBanner />}
        <div className="list">
          {sectionsFor().map((s) => (
            <button key={s.id} className="list-item" onClick={() => go(`/settings/${s.id}`)} data-testid={`settings-${s.id}`}>
              <span className="avatar">
                <Icon name={s.icon} size={19} />
              </span>
              <span className="list-main">
                <strong>{s.label}</strong>
                <span className="small muted">
                  {s.id === 'company' && company?.name ? company.name : s.id === 'plan' && lic?.state === 'free' ? 'Free plan · Upgrade' : s.id === 'license' && lic?.daysLeft !== null && lic?.daysLeft !== undefined ? `${lic.daysLeft} days left` : s.detail}
                </span>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </div>
        <p className="center small muted">
          DocGen Mobile · a product of reynrel.in · <a href="mailto:info.reynrel@gmail.com">info.reynrel@gmail.com</a>
        </p>
      </div>
    </>
  );
}
