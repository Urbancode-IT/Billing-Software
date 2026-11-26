// v1.10.77 (#85) - product helpers for bulk edit and the stock report.
import { appliedStock, isCancelledBill, isServiceProduct, salesSign, baseQty } from '../utils.js';

const blank = (v) => v === '' || v === null || v === undefined;
const numOrZero = (v) => (blank(v) ? 0 : Number(v));

// Common GST slabs shown on the product form (India). Callers may pass a
// country-specific list; this is the fallback when none is available.
export const PRODUCT_GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28, 40];

// Parse a required non-negative number, or { error }. Empty is refused.
const requiredNonNeg = (raw, label) => {
  if (blank(raw) || (typeof raw === 'string' && !String(raw).trim())) {
    return { error: `${label} is required` };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} must be a number` };
  if (n < 0) return { error: `${label} cannot be negative` };
  return { value: n };
};

// Parse an optional non-negative number. Empty → undefined (caller decides
// default). Filled but invalid → { error }.
const optionalNonNeg = (raw, label) => {
  if (blank(raw) || (typeof raw === 'string' && !String(raw).trim())) {
    return { value: undefined };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} must be a number` };
  if (n < 0) return { error: `${label} cannot be negative` };
  return { value: n };
};

/**
 * Clean + validate the fields the Product Add/Edit form (and bulk edit /
 * POST /api/products) share. Does not invent a GST % when left empty —
 * invoices then use their own default via `product.taxPercent ?? default`.
 * Purchase and selling prices stay separate; selling is required; blank
 * stock on goods means "not tracked" (left out of stock maths).
 *
 * @returns {{ error: string } | { fields: object, clearTaxPercent: boolean, clearStock: boolean }}
 */
export const cleanProductFields = (input = {}) => {
  const name = String(input.name ?? '').trim();
  if (!name) return { error: 'Product name is required' };

  const sell = requiredNonNeg(input.sellingPrice, 'Selling price');
  if (sell.error) return { error: sell.error };

  const purchase = optionalNonNeg(input.purchasePrice, 'Purchase price');
  if (purchase.error) return { error: purchase.error };

  // GST is optional. Empty must NOT become 0 — only an explicit 0% counts.
  let taxPercent;
  let clearTaxPercent = false;
  if (blank(input.taxPercent) || (typeof input.taxPercent === 'string' && !String(input.taxPercent).trim())) {
    clearTaxPercent = true;
  } else {
    const gst = Number(input.taxPercent);
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      return { error: 'GST % must be between 0 and 100' };
    }
    taxPercent = gst;
  }

  const service = input.kind === 'service' || isServiceProduct(input);
  let stock;
  let clearStock = service;
  if (!service) {
    const st = optionalNonNeg(input.stock, 'Stock quantity');
    if (st.error) return { error: st.error };
    if (st.value === undefined) clearStock = true;
    else stock = st.value;
  }

  const fields = {
    name,
    hsn: String(input.hsn ?? '').trim(),
    purchasePrice: purchase.value === undefined ? 0 : purchase.value,
    sellingPrice: sell.value,
    rate: sell.value, // mirror for legacy readers / invoices
    unit: String(input.unit || '').trim() || 'Pcs',
    kind: service ? 'service' : 'goods',
    description: String(input.description ?? '').trim(),
  };
  if (!clearTaxPercent) fields.taxPercent = taxPercent;
  if (!clearStock) fields.stock = stock;

  return { fields, clearTaxPercent, clearStock };
};

// One edited row of the bulk-edit grid -> the product to save, or { error }.
// Same rules as the single product form: name + selling price required,
// GST % optional (empty does not become 0), prices/stock non-negative,
// selling price mirrored to `rate` for older readers.
export const bulkRowToProduct = (product, edits) => {
  const merged = { ...product, ...edits };
  // Prefer the typed selling price; fall back to legacy `rate` only when
  // the row was never given a sellingPrice (pre-v1.10.29 products).
  const sellingRaw = Object.prototype.hasOwnProperty.call(edits, 'sellingPrice')
    ? edits.sellingPrice
    : (product.sellingPrice ?? product.rate);
  const cleaned = cleanProductFields({
    ...merged,
    sellingPrice: sellingRaw,
    kind: isServiceProduct(merged) ? 'service' : (merged.kind || 'goods'),
  });
  if (cleaned.error) {
    const name = String(merged.name ?? product.name ?? '').trim() || 'product';
    // Prefix with the product name for the bulk-edit toast, except when the
    // message already starts with a capitalised field label from cleanProductFields.
    return { error: cleaned.error.toLowerCase().includes('product name') ? cleaned.error : `${name}: ${cleaned.error}` };
  }
  const next = {
    ...product,
    ...cleaned.fields,
  };
  if (cleaned.clearTaxPercent) {
    delete next.taxPercent;
  }
  if (cleaned.clearStock) {
    delete next.stock;
  }
  return { product: next };
};

// Closing stock of each product at the end of a day (YYYY-MM-DD), worked
// back from today's stock: take off what purchases dated after it brought in,
// and add back what invoices dated after it took out (each invoice's own
// stock record, see appliedStock). Stock typed in by hand on the Products
// screen has no date, so it counts as if it happened today.
// v1.10.83 (#115) - production entries dated after it are undone the same
// way, from each entry's own stock record (raw materials back, made goods out).
// v1.10.83 (#121) - services have no stock and are left out.
// v1.10.85 (#168) - purchase returns (debit notes) dated after it are undone
// from their own stock record too (the goods sent back come back).
// v1.10.85 (#148) - quantities in the base unit (2 boxes of 12 = 24 Pcs).
// v1.10.85 - stock adjustments (damaged, found, ...) dated after it are undone
// from their own stock record, like production entries.
// Returns Map(productId -> quantity).
export const closingStock = (products, bills, purchases, asOf, productions = [], debitNotes = [], adjustments = []) => {
  const qty = new Map((products || []).filter((p) => !isServiceProduct(p)).map((p) => [p.id, Number(p.stock) || 0]));
  const byName = new Map((products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p.id]));
  for (const pur of purchases || []) {
    if (!pur?.date || pur.date <= asOf) continue;
    for (const it of pur.items || []) {
      const id = it.productId || byName.get(String(it.name || '').trim().toLowerCase());
      if (id && qty.has(id)) qty.set(id, qty.get(id) - baseQty(it));
    }
  }
  for (const b of bills || []) {
    if (!b?.invoiceDate || b.invoiceDate <= asOf || isCancelledBill(b)) continue;
    for (const [id, change] of Object.entries(appliedStock(b))) {
      if (qty.has(id)) qty.set(id, qty.get(id) - change);
    }
  }
  for (const pr of [...(productions || []), ...(debitNotes || []), ...(adjustments || [])]) {
    if (!pr?.date || pr.date <= asOf) continue;
    for (const [id, change] of Object.entries(pr.stockApplied || {})) {
      if (qty.has(id)) qty.set(id, qty.get(id) - (Number(change) || 0));
    }
  }
  for (const [id, q] of qty) qty.set(id, Math.round(q * 1000) / 1000);
  return qty;
};

// Value of a quantity at the product's purchase price (cost), or at its
// selling price when no purchase price is known.
export const stockValueOf = (product, quantity) => {
  const cost = Number(product?.purchasePrice) || 0;
  const price = cost > 0 ? cost : (Number(product?.sellingPrice) || Number(product?.rate) || 0);
  return { price, value: Math.round(price * (Number(quantity) || 0) * 100) / 100, atCost: cost > 0 };
};

// v1.10.84 (#146) - cost of goods sold, for Profit & Loss: quantity sold x
// the product's Purchase price. Profit used to be sales minus Expenses only, so
// with no expenses entered all the sales showed as profit. Credit notes
// (salesSign -1) take their goods back out; quotes and challans (0) count
// nothing. A line finds its product by productId, else by name. Services,
// charge lines (delivery) and SAC lines (99...) cost nothing. A goods line
// whose product has no purchase price, or that is not a product at all, counts
// 0 and its name is listed in `missing` so the report can ask for the price.
export const costOfGoodsSold = (bills, products) => {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const byName = new Map((products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p]));
  const missing = new Set();
  let cost = 0;
  for (const bill of bills || []) {
    const sign = salesSign(bill);
    if (!sign) continue;
    for (const it of bill.data?.items || []) {
      const qty = baseQty(it); // #148 - the purchase price is per base unit
      if (!qty || it.isCharge || /^99/.test(String(it.hsn || '').trim())) continue;
      const p = (it.productId && byId.get(it.productId)) || byName.get(String(it.name || '').trim().toLowerCase());
      if (isServiceProduct(p)) continue;
      const price = Number(p?.purchasePrice) || 0;
      if (price > 0) cost += sign * qty * price;
      else if (String(it.name || '').trim()) missing.add(String(p?.name || it.name).trim());
    }
  }
  return { cost: Math.round(cost * 100) / 100, missing: [...missing] };
};

// v1.10.85 (idea from PR #178) - the cost of goods for a report shown in a
// foreign currency: purchase prices are in the business's own currency, so
// each invoice's cost is divided by the exchange rate saved on it (rupees per
// unit of the invoice's currency). An invoice without a rate cannot be
// converted: it is counted in `noRate` and adds nothing.
export const costOfGoodsSoldIn = (bills, products, base, rateOf) => {
  let cost = 0;
  let noRate = 0;
  const missing = new Set();
  for (const bill of bills || []) {
    const c = costOfGoodsSold([bill], products);
    c.missing.forEach((m) => missing.add(m));
    if (!c.cost) continue;
    const rate = rateOf(bill, base);
    if (rate > 0) cost += c.cost / rate;
    else noRate += 1;
  }
  return { cost: Math.round(cost * 100) / 100, missing: [...missing], noRate };
};
