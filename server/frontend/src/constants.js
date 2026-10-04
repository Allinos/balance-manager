/** Lists used in customer forms (admin panel). */

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
];
export const BUSINESS_TYPES = ['Trading / Retail', 'Wholesale / Distribution', 'Manufacturing', 'Services', 'Construction / Contractor', 'Freelancer / Agency', 'Other'];

/** Contact address shown on the website (the server's SUPPORT_EMAIL is used for emails). */
export const SUPPORT_EMAIL = 'info.reynrel@gmail.com';

/** Help & Support topics (same keys as the server). */
export const SUPPORT_TOPICS = [
  { value: 'buying', label: 'Buying & payment' },
  { value: 'license', label: 'License & activation' },
  { value: 'install', label: 'Installing DocGen' },
  { value: 'using', label: 'Using DocGen' },
  { value: 'refund', label: 'Cancellation & refund' },
  { value: 'other', label: 'Something else' },
];
