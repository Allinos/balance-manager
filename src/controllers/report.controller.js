'use strict';

const reportService = require('../services/report.service');
const audit = require('../services/audit.service');
const { currentMonthRange, formatDate } = require('../utils/date');

exports.index = async (req, res) => {
  const { start, end } = req.query.start && req.query.end
    ? { start: req.query.start, end: req.query.end }
    : currentMonthRange();

  const { ledger, deposits, dms } = await reportService.collect({ start, end });

  const totals = ledger.reduce(
    (acc, r) => {
      acc.total += Number(r.total_collection);
      acc.deposits += Number(r.deposits || 0);
      return acc;
    },
    { total: 0, deposits: 0 }
  );
  const dmsTotal = dms.reduce((a, r) => a + Number(r.amount), 0);

  res.render('reports/index', {
    title: 'Reports',
    active: 'reports',
    range: { start, end },
    ledger,
    deposits,
    dms,
    summary: {
      totalCollection: totals.total,
      totalDeposits: totals.deposits,
      closingBalance: ledger.length ? ledger[ledger.length - 1].remaining_balance : 0,
      dmsTotal,
    },
  });
};

exports.exportExcel = async (req, res) => {
  const { start, end } = req.query;
  const wb = await reportService.buildExcel(start && end ? { start, end } : {});
  const fname = `balance-report_${start || 'all'}_${end || ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await audit.record(req, { action: 'EXPORT', entity: 'report', details: { format: 'xlsx', start, end } });
  await wb.xlsx.write(res);
  res.end();
};

exports.exportPdf = async (req, res) => {
  const { start, end } = req.query;
  const fname = `balance-report_${start || 'all'}_${end || ''}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  await audit.record(req, { action: 'EXPORT', entity: 'report', details: { format: 'pdf', start, end } });
  await reportService.streamPdf(res, start && end ? { start, end } : {});
};
