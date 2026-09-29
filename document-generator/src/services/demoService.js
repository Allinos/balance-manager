/**
 * Sample data for exploring the app. Every record is flagged `is_demo = 1`
 * and labelled "(Sample)" so it can be removed with one click.
 */

import { call } from './api.js';
import { saveCategory, saveProduct, saveParty, listCategories } from './catalogService.js';
import { newDocument, saveDocument, blankItem } from './documentService.js';
import { addDays, todayISO } from '../utils/dates.js';

export async function loadDemoData(ctx) {
  const categories = await listCategories();
  let categoryId = categories.find((c) => c.name.toLowerCase() === 'furniture')?.id;
  if (!categoryId) categoryId = await saveCategory({ name: 'Furniture', is_demo: 1 });

  const chair = {
    type: 'PRODUCT', name: 'Office Chair (Sample)', sku: 'CHR-001', category_id: categoryId,
    description: 'Ergonomic mesh chair with arm rest', hsn_sac: '9401', unit: 'Nos',
    selling_price: '4500', purchase_price: '3200', tax_rate: '18', tax_type: 'EXCLUSIVE', is_demo: 1,
  };
  const table = {
    type: 'PRODUCT', name: 'Work Table 4x2 ft (Sample)', sku: 'TBL-042', category_id: categoryId,
    description: 'Engineered wood, walnut finish', hsn_sac: '9403', unit: 'Nos',
    selling_price: '7800', purchase_price: '5600', tax_rate: '18', tax_type: 'EXCLUSIVE', is_demo: 1,
  };
  const service = {
    type: 'SERVICE', name: 'Installation Service (Sample)', sku: 'SRV-INST', category_id: null,
    description: 'On-site assembly and installation', hsn_sac: '995419', unit: 'Job',
    selling_price: '1500', purchase_price: '0', tax_rate: '18', tax_type: 'EXCLUSIVE', is_demo: 1,
  };
  const ids = [];
  for (const p of [chair, table, service]) ids.push(await saveProduct(p));

  const party = {
    name: 'ABC Construction (Sample)', company_name: 'ABC Construction Pvt Ltd', phone: '+91 98765 43210',
    email: 'accounts@abc-construction.example', address: '12, MG Road\nBengaluru, Karnataka 560001',
    state: 'Karnataka', gstin: '29ABCDE1234F1Z5', tax_id: '', is_demo: 1,
  };
  const partyId = await saveParty(party);

  const partyFields = {
    party_id: partyId, party_name: party.name, party_company: party.company_name, party_phone: party.phone,
    party_email: party.email, party_address: party.address, party_state: party.state, party_gstin: party.gstin,
    place_of_supply: party.state,
  };
  const line = (p, id, qty) => ({
    ...blankItem(ctx.settings), product_id: id, name: p.name, description: p.description, hsn_sac: p.hsn_sac,
    unit: p.unit, quantity: qty, unit_price: p.selling_price, tax_rate: p.tax_rate,
  });

  const invoice = newDocument('TAX_INVOICE', ctx);
  invoice.document = {
    ...invoice.document, ...partyFields, status: 'ISSUED', is_demo: 1, notes: 'Thank you for your business!',
    meta: {
      ...invoice.document.meta,
      paymentTerms: '15 days credit', buyerOrderNo: 'PO/ABC/2026/118', buyerOrderDate: addDays(todayISO(), -5),
      dispatchedThrough: 'Own vehicle', destination: 'Bengaluru', vehicleNo: 'KA01AB1234', reverseCharge: 'No',
    },
  };
  invoice.items = [line(chair, ids[0], '10'), line(table, ids[1], '4'), line(service, ids[2], '1')];
  await saveDocument(invoice, ctx);

  const quote = newDocument('QUOTATION', ctx);
  quote.document = {
    ...quote.document, ...partyFields, is_demo: 1,
    issue_date: addDays(todayISO(), -3), due_date: addDays(todayISO(), 12),
  };
  quote.items = [line(chair, ids[0], '25'), line(service, ids[2], '2')];
  await saveDocument(quote, ctx);
}

export const removeDemoData = () => call('demo_remove');
