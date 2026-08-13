'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const morgan = require('morgan');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');

const config = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const { formatCurrency } = require('./utils/money');
const { formatDate, formatDateTime, toISODate } = require('./utils/date');

const app = express();

// ----- View engine -----
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ----- Security & logging -----
app.use(
  helmet({
    contentSecurityPolicy: false, // charts/CDN assets loaded locally; relax CSP for simplicity
  })
);
if (!config.isProd) app.use(morgan('dev'));

// ----- Body parsing & method override -----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

// ----- Static assets -----
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// ----- Sessions & flash -----
app.set('trust proxy', 1);
app.use(
  session({
    name: 'bm.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8h
      secure: config.isProd,
    },
  })
);
app.use(flash());

// ----- View locals (available in every template) -----
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currencySymbol = config.currencySymbol;
  res.locals.fmtCurrency = formatCurrency;
  res.locals.fmtDate = formatDate;
  res.locals.fmtDateTime = formatDateTime;
  res.locals.toISODate = toISODate;
  res.locals.active = '';
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
  };
  const raw = req.flash('formData')[0];
  res.locals.formData = raw ? JSON.parse(raw) : {};
  res.locals.query = req.query;
  next();
});

// ----- Routes -----
app.use('/', routes);

// ----- Errors -----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
