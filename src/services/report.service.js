'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { buildLedger } = require('./ledger.service');
const DepositModel = require('../models/deposit.model');
const DmsModel = require('../models/dms.model');
const { formatCurrency } = require('../utils/money');
const { formatDate } = require('../utils/date');

/** Assemble the data used by every report / export. */
async function collect({ start, end } = {}) {
  const [ledger, deposits, dms] = await Promise.all([
    buildLedger({ start, end }),
    DepositModel.findAll({ start, end }),
    DmsModel.findAll({ start, end }),
  ]);
  return { ledger, deposits, dms };
}

/** Build an Excel workbook (returns an ExcelJS.Workbook). */
async function buildExcel({ start, end } = {}) {
  const { ledger, deposits, dms } = await collect({ start, end });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Balance Manager';
  wb.created = new Date();

  // --- Collections / Ledger ---
  const ws = wb.addWorksheet('Collections');
  ws.columns = [
    { header: 'Date', key: 'collection_date', width: 14 },
    { header: 'Online', key: 'online', width: 14 },
    { header: 'Cash', key: 'cash', width: 14 },
    { header: 'Credit Balance', key: 'credit_balance', width: 16 },
    { header: 'Total Collection', key: 'total_collection', width: 16 },
    { header: 'Old Balance Coll.', key: 'old_balance_collection', width: 16 },
    { header: 'Opening Balance', key: 'opening_balance', width: 16 },
    { header: 'Deposits', key: 'deposits', width: 14 },
    { header: 'Remaining Balance', key: 'remaining_balance', width: 18 },
    { header: 'Available Cash', key: 'available_cash', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  ledger.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };

  // --- Deposits ---
  const wd = wb.addWorksheet('Deposits');
  wd.columns = [
    { header: 'Date', key: 'deposit_date', width: 14 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Mode', key: 'mode', width: 12 },
    { header: 'Deposited By', key: 'deposited_by', width: 18 },
    { header: 'Reference', key: 'reference_no', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  deposits.forEach((r) => wd.addRow(r));
  wd.getRow(1).font = { bold: true };

  // --- DMS ---
  const wm = wb.addWorksheet('DMS');
  wm.columns = [
    { header: 'Date', key: 'dms_date', width: 14 },
    { header: 'DMS Amount', key: 'dms_amount', width: 14 },
    { header: 'Receipt Amount', key: 'receipt_amount', width: 16 },
    { header: 'Variance', key: 'variance', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Reference', key: 'reference_no', width: 18 },
    { header: 'Remarks', key: 'remarks', width: 24 },
  ];
  dms.forEach((r) => wm.addRow(r));
  wm.getRow(1).font = { bold: true };

  return wb;
}

/** Stream a PDF report to the given writable stream (e.g. res). */
async function streamPdf(res, { start, end } = {}) {
  const { ledger, deposits, dms } = await collect({ start, end });
  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(18).text('Balance Manager – Report', { align: 'center' });
  const rangeText = start && end ? `${formatDate(start)}  to  ${formatDate(end)}` : 'All dates';
  doc.moveDown(0.3).fontSize(10).fillColor('#555').text(rangeText, { align: 'center' });
  doc.moveDown(1).fillColor('#000');

  const section = (title) => {
    doc.moveDown(0.6).fontSize(13).fillColor('#1d4ed8').text(title).fillColor('#000').moveDown(0.3);
  };

  // Collections table
  section('Collections / Ledger');
  const collHeaders = ['Date', 'Total Coll.', 'Opening', 'Deposits', 'Remaining', 'Avail. Cash'];
  drawTable(doc, collHeaders, ledger.map((r) => [
    formatDate(r.collection_date),
    formatCurrency(r.total_collection),
    formatCurrency(r.opening_balance),
    formatCurrency(r.deposits || 0),
    formatCurrency(r.remaining_balance),
    formatCurrency(r.available_cash),
  ]));

  // Deposits
  section('Deposits');
  drawTable(doc, ['Date', 'Amount', 'Mode', 'Deposited By', 'Reference'],
    deposits.map((r) => [
      formatDate(r.deposit_date),
      formatCurrency(r.amount),
      r.mode,
      r.deposited_by || '-',
      r.reference_no || '-',
    ]));

  // DMS
  section('DMS Reconciliation');
  drawTable(doc, ['Date', 'DMS', 'Receipt', 'Variance', 'Status'],
    dms.map((r) => [
      formatDate(r.dms_date),
      formatCurrency(r.dms_amount),
      formatCurrency(r.receipt_amount),
      formatCurrency(r.variance),
      r.status,
    ]));

  doc.end();
}

/** Minimal fixed-width table renderer for pdfkit. */
function drawTable(doc, headers, rows) {
  const startX = doc.x;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / headers.length;
  const rowHeight = 18;

  const renderRow = (cells, opts = {}) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    const y = doc.y;
    doc.fontSize(8).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((c, i) => {
      doc.text(String(c ?? ''), startX + i * colWidth + 2, y + 4, {
        width: colWidth - 4,
        ellipsis: true,
      });
    });
    doc.moveTo(startX, y + rowHeight).lineTo(startX + colWidth * headers.length, y + rowHeight)
      .strokeColor('#e5e7eb').stroke();
    doc.y = y + rowHeight;
    doc.x = startX;
  };

  renderRow(headers, { bold: true });
  if (!rows.length) {
    doc.fontSize(8).fillColor('#999').text('No records', startX, doc.y + 4).fillColor('#000');
    doc.moveDown();
    return;
  }
  rows.forEach((r) => renderRow(r));
}

module.exports = { collect, buildExcel, streamPdf };
