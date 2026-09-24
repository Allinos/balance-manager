/** Products, services, categories and saved customers/vendors. */

import { call } from './api.js';

export const listProducts = (filter = {}) => call('products_list', { filter });
export const saveProduct = (product) => call('product_save', { product });
export const deleteProduct = (id) => call('product_delete', { id });

export const listCategories = () => call('categories_list');
export const saveCategory = (category) => call('category_save', { category });
export const deleteCategory = (id) => call('category_delete', { id });

export const listParties = (search = '') => call('parties_list', { search });
export const saveParty = (party) => call('party_save', { party });
export const deleteParty = (id) => call('party_delete', { id });
