'use strict';

const reportService = require('../services/report.service');
const audit = require('../services/audit.service');
const { resolveRange, toFilter } = require('../utils/range');

exports.index = async (req, res) => {
  const range = resolveRange(req.query, { fallback: 'all' });
  const { ledger, deposits, dms } = await reportService.collect(toFilter(range));

  const totals = ledger.reduce(
    (acc, r) => {
      acc.total += Number(r.total_collection);
      acc.deposits += Number(r.deposits || 0);
      acc.dms += Number(r.dms_deposits || 0);
      return acc;
    },
    { total: 0, deposits: 0, dms: 0 }
  );

  res.render('reports/index', {
    title: 'Reports',
    active: 'reports',
    range,
    ledger,
    deposits,
    dms,
    summary: {
      totalCollection: totals.total,
      totalDeposits: totals.deposits,
      closingBalance: ledger.length ? ledger[ledger.length - 1].remaining_balance : 0,
      dmsTotal: totals.dms,
    },
  });
};

exports.exportExcel = async (req, res) => {
  const range = resolveRange(req.query, { fallback: 'all' });
  const wb = await reportService.buildExcel(toFilter(range));
  const fname = `balance-report_${range.start || 'all'}_${range.end || ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await audit.record(req, { action: 'EXPORT', entity: 'report', details: { format: 'xlsx', ...range } });
  await wb.xlsx.write(res);
  res.end();
};

exports.exportPdf = async (req, res) => {
  const range = resolveRange(req.query, { fallback: 'all' });
  const fname = `balance-report_${range.start || 'all'}_${range.end || ''}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await audit.record(req, { action: 'EXPORT', entity: 'report', details: { format: 'pdf', ...range } });
  await reportService.streamPdf(res, toFilter(range));
};
