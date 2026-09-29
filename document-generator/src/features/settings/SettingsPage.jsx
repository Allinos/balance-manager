import Icon from '../../components/Icon.jsx';
import { Link } from '../../router/router.jsx';
import CompanySettings from './CompanySettings.jsx';
import DocumentSettings, { DocumentTypeSettings } from './DocumentSettings.jsx';
import { CurrencySettings, NumberingSettings, TaxSettings } from './TaxCurrencySettings.jsx';
import {
  AboutSettings,
  AppearanceSettings,
  BackupSettings,
  GeneralSettings,
} from './OtherSettings.jsx';
import UnitsSettings from './UnitsSettings.jsx';
import LicenseSettings from '../license/LicenseSettings.jsx';

const SECTIONS = [
  { id: 'company', label: 'Company', icon: 'building', Component: CompanySettings },
  { id: 'documents', label: 'Documents', icon: 'documents', Component: DocumentSettings },
  { id: 'types', label: 'Document Types', icon: 'layers', Component: DocumentTypeSettings },
  { id: 'tax', label: 'Tax', icon: 'percent', Component: TaxSettings },
  { id: 'currency', label: 'Currency', icon: 'coins', Component: CurrencySettings },
  { id: 'numbering', label: 'Numbering', icon: 'hash', Component: NumberingSettings },
  { id: 'units', label: 'Units', icon: 'box', Component: UnitsSettings },
  { id: 'general', label: 'General', icon: 'sliders', Component: GeneralSettings },
  { id: 'appearance', label: 'Appearance', icon: 'palette', Component: AppearanceSettings },
  { id: 'license', label: 'License & Account', icon: 'key', Component: LicenseSettings },
  { id: 'backup', label: 'Backup', icon: 'database', Component: BackupSettings },
  { id: 'about', label: 'About', icon: 'info', Component: AboutSettings },
];

export default function SettingsPage({ params }) {
  const current = SECTIONS.find((s) => s.id === params.section) || SECTIONS[0];
  const { Component } = current;
  return (
    <div className="page settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <h1>Settings</h1>
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/settings/${s.id}`} data-testid={`settings-${s.id}`} className={`settings-link ${s.id === current.id ? 'active' : ''}`}>
            <Icon name={s.icon} size={16} />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="settings-content card" data-keynav>
        <Component key={current.id} />
      </div>
    </div>
  );
}
