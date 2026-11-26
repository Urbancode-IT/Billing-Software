import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { cleanProductFields } from '#shared/utils/products.js';

/**
 * Core CRUD resources: profile, clients, templates, products,
 * expenses, recurring, receipts.
 *
 * @param {import('express').Express} app
 * @param {{
 *   DATA_DIR: string,
 *   safeFileName: Function,
 *   readAllFromDir: Function,
 *   readJSON: Function,
 *   writeJSON: Function,
 *   deleteFile: Function,
 * }} ctx
 */
export function registerResourceRoutes(app, ctx) {
  const {
    DATA_DIR,
    safeFileName,
    readAllFromDir,
    readJSON,
    writeJSON,
    deleteFile,
  } = ctx;

  // ========================
  // PROFILE
  // ========================
  const PROFILE_PATH = path.join(DATA_DIR, 'profile.json');
  const DEFAULT_PROFILE = {
    businessName: '', address: '', state: '', gstin: '', pan: '',
    email: '', phone: '', bankName: '', accountNumber: '', ifsc: '',
    logo: '', signature: '', upiId: '', googleClientId: '', googleDriveFolder: 'GST Billing Invoices',
  };

  app.get('/api/profile', (req, res) => {
    res.json(readJSON(PROFILE_PATH, DEFAULT_PROFILE));
  });

  app.post('/api/profile', (req, res) => {
    writeJSON(PROFILE_PATH, req.body);
    res.json({ success: true });
  });

  // ========================
  // CLIENTS
  // ========================
  app.get('/api/clients', (req, res) => {
    const clients = readAllFromDir('clients');
    clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(clients);
  });

  app.post('/api/clients', (req, res) => {
    const client = req.body;
    if (!client.id) client.id = 'cli_' + Date.now() + crypto.randomBytes(3).toString('hex');
    const filePath = path.join(DATA_DIR, 'clients', safeFileName(client.id) + '.json');
    writeJSON(filePath, client);
    res.json({ success: true, id: client.id });
  });

  app.delete('/api/clients/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'clients', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });

  // ========================
  // TERMS TEMPLATES
  // ========================
  app.get('/api/templates', (req, res) => {
    let templates = readAllFromDir('templates');
    if (templates.length === 0) {
      const defaultTpl = {
        id: 'default',
        name: 'Standard Terms',
        content: '1. Payment is due within 15 days of invoice date unless otherwise agreed in writing.\n2. Interest @ 18% p.a. will be charged on overdue payments beyond the due date.\n3. The scope of work is limited to what is explicitly mentioned in the project proposal/agreement. Any additional requirements will be quoted and billed separately.\n4. All intellectual property and source code will be transferred to the client only upon receipt of full payment.\n5. We shall not be liable for any delays caused by incomplete or late submission of content, credentials, or approvals from the client\'s end.\n6. Any change requests after project approval may attract additional charges and revised timelines.\n7. This invoice is subject to the jurisdiction of courts at the service provider\'s registered location.\n8. E. & O.E.',
      };
      writeJSON(path.join(DATA_DIR, 'templates', 'default.json'), defaultTpl);
      templates = [defaultTpl];
    }
    templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(templates);
  });

  app.post('/api/templates', (req, res) => {
    const tpl = req.body;
    if (!tpl.id) tpl.id = 'tpl_' + Date.now() + crypto.randomBytes(3).toString('hex');
    const filePath = path.join(DATA_DIR, 'templates', safeFileName(tpl.id) + '.json');
    writeJSON(filePath, tpl);
    res.json({ success: true, id: tpl.id });
  });

  app.delete('/api/templates/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'templates', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });

  // ========================
  // PRODUCTS / INVENTORY
  // ========================
  app.get('/api/products', (req, res) => {
    const products = readAllFromDir('products');
    products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(products);
  });

  app.post('/api/products', (req, res) => {
    const incoming = req.body || {};
    const existing = incoming.id
      ? readJSON(path.join(DATA_DIR, 'products', safeFileName(incoming.id) + '.json'), null)
      : null;
    const has = (k) => Object.prototype.hasOwnProperty.call(incoming, k);
    // Body may omit taxPercent/stock on stock-only updates (applyStockChanges).
    // Only treat them as "clear" when the client sent null/'' explicitly; otherwise
    // keep the saved value so GST is never wiped by a stock bump.
    const cleaned = cleanProductFields({
      ...incoming,
      sellingPrice: incoming.sellingPrice ?? incoming.rate ?? existing?.sellingPrice ?? existing?.rate,
      purchasePrice: has('purchasePrice') ? incoming.purchasePrice : (existing?.purchasePrice ?? ''),
      taxPercent: has('taxPercent') ? incoming.taxPercent : (existing?.taxPercent ?? ''),
      stock: has('stock') ? incoming.stock : (existing?.stock ?? ''),
      kind: incoming.kind || existing?.kind || 'goods',
      name: incoming.name ?? existing?.name,
      hsn: has('hsn') ? incoming.hsn : (existing?.hsn ?? ''),
      unit: incoming.unit || existing?.unit || 'Pcs',
      description: has('description') ? incoming.description : (existing?.description ?? ''),
    });
    if (cleaned.error) {
      return res.status(400).json({ error: cleaned.error });
    }
    const product = {
      ...(existing || {}),
      ...incoming,
      ...cleaned.fields,
    };
    if (!product.id) product.id = 'prod_' + Date.now() + crypto.randomBytes(3).toString('hex');
    // Clear only when the client asked to (null/'') or this is a service.
    if ((has('taxPercent') && cleaned.clearTaxPercent) || product.taxPercent === null) delete product.taxPercent;
    if (product.kind === 'service' || product.stock === null || (has('stock') && cleaned.clearStock)) {
      delete product.stock;
    }
    const filePath = path.join(DATA_DIR, 'products', safeFileName(product.id) + '.json');
    writeJSON(filePath, product);
    res.json({ success: true, id: product.id });
  });

  app.delete('/api/products/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'products', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });

  // ========================
  // EXPENSES
  // ========================
  app.get('/api/expenses', (req, res) => {
    const expenses = readAllFromDir('expenses');
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(expenses);
  });

  app.post('/api/expenses', (req, res) => {
    const expense = req.body;
    if (!expense.id) expense.id = 'exp_' + Date.now() + crypto.randomBytes(3).toString('hex');
    const filePath = path.join(DATA_DIR, 'expenses', safeFileName(expense.id) + '.json');
    writeJSON(filePath, expense);
    res.json({ success: true, id: expense.id });
  });

  app.delete('/api/expenses/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'expenses', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });

  // ========================
  // RECURRING INVOICES
  // ========================
  app.get('/api/recurring', (req, res) => {
    const items = readAllFromDir('recurring');
    items.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
    res.json(items);
  });

  app.post('/api/recurring', (req, res) => {
    const item = req.body;
    if (!item.id) item.id = 'rec_' + Date.now() + crypto.randomBytes(3).toString('hex');
    const filePath = path.join(DATA_DIR, 'recurring', safeFileName(item.id) + '.json');
    writeJSON(filePath, item);
    res.json({ success: true, id: item.id });
  });

  app.delete('/api/recurring/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'recurring', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });

  // ========================
  // RECEIPTS / PAYMENT VOUCHERS
  // ========================
  app.get('/api/receipts', (req, res) => {
    const receipts = readAllFromDir('receipts');
    receipts.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(receipts);
  });

  app.post('/api/receipts', (req, res) => {
    const receipt = req.body;
    if (!receipt.id) receipt.id = 'rcp_' + Date.now() + crypto.randomBytes(3).toString('hex');
    const filePath = path.join(DATA_DIR, 'receipts', safeFileName(receipt.id) + '.json');
    writeJSON(filePath, receipt);
    res.json({ success: true, id: receipt.id });
  });

  app.delete('/api/receipts/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'receipts', safeFileName(req.params.id) + '.json');
    deleteFile(filePath);
    res.json({ success: true });
  });
}
