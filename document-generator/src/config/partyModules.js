/**
 * Optional Customers and Vendors modules. Both are off by default: saved parties still fill in documents
 * (type a name in the editor), and a module adds a screen to list, search, add, edit and archive them.
 * Each is switched on or off on its own (Settings → Customers & Vendors, or the small + under Products & Services).
 */
export const PARTY_MODULES = [
  {
    kind: 'customer',
    setting: 'customersModule',
    label: 'Customers',
    singular: 'customer',
    icon: 'users',
    description: 'People and businesses you sell to: contact details, GSTIN, addresses and how many documents each has.',
  },
  {
    kind: 'vendor',
    setting: 'vendorsModule',
    label: 'Vendors',
    singular: 'vendor',
    icon: 'truck',
    description: 'Suppliers you buy from: for purchase orders, purchase bills, payment vouchers and work orders.',
  },
];

export const moduleFor = (kind) => PARTY_MODULES.find((m) => m.kind === kind) || PARTY_MODULES[0];

/** The modules switched on in settings. */
export const enabledModules = (settings) => PARTY_MODULES.filter((m) => settings?.[m.setting]);

export const PARTY_KIND_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'both', label: 'Both' },
];
