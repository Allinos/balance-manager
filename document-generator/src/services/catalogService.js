/** Products, services, categories and saved customers/vendors. */

import { call } from './api.js';

export const listProducts = (filter = {}) => call('products_list', { filter });
export const saveProduct = (product) => call('product_save', { product });
export const deleteProduct = (id) => call('product_delete', { id });

export const listCategories = () => call('categories_list');
export const saveCategory = (category) => call('category_save', { category });
export const deleteCategory = (id) => call('category_delete', { id });

/** Saved parties for the name suggestions in documents (archived ones are left out). */
export const listParties = (search = '') => call('parties_list', { search });
/** Customers & Vendors screen: { kind: 'customer'|'vendor', archived: bool, search } → rows with document_count. */
export const queryParties = (filter = {}) => call('parties_query', { filter });
export const saveParty = (party) => call('party_save', { party });
/** Safe delete: a party on any document is archived instead. Resolves to 'archived' or 'deleted'. */
export const deleteParty = (id) => call('party_delete', { id });
export const archiveParty = (id, archived = true) => call('party_archive', { id, archived });
