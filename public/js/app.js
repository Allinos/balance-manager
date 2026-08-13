/* Balance Manager – client interactions */
(function () {
  'use strict';

  // ---- Mobile sidebar toggle ----
  var sidebar = document.querySelector('[data-sidebar]');
  var toggle = document.querySelector('[data-sidebar-toggle]');
  var backdrop = document.querySelector('[data-sidebar-backdrop]');
  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      if (sidebar) sidebar.classList.toggle('is-open');
      if (backdrop) backdrop.classList.toggle('is-open');
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // ---- Auto-hide flash alerts ----
  document.querySelectorAll('[data-autohide]').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }, 4000);
  });

  // ---- Delete confirmation ----
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Live "Total Collection" preview on collection form ----
  var calcInputs = document.querySelectorAll('[data-calc]');
  var totalPreview = document.getElementById('total_preview');
  function recalcTotal() {
    var sum = 0;
    calcInputs.forEach(function (i) { sum += parseFloat(i.value) || 0; });
    if (totalPreview) totalPreview.value = sum.toFixed(2);
  }
  if (totalPreview && calcInputs.length) {
    calcInputs.forEach(function (i) { i.addEventListener('input', recalcTotal); });
    recalcTotal();
  }

  // ---- Dashboard charts ----
  var dataEl = document.getElementById('dashboard-data');
  if (dataEl && typeof Chart !== 'undefined') {
    var d = JSON.parse(dataEl.textContent || '{}');

    var trendEl = document.getElementById('chartTrend');
    if (trendEl) {
      new Chart(trendEl, {
        type: 'bar',
        data: {
          labels: d.labels,
          datasets: [
            { label: 'Total Collection', data: d.total, backgroundColor: 'rgba(37,99,235,.7)', borderRadius: 4 },
            { label: 'Deposits', data: d.deposits, backgroundColor: 'rgba(22,163,74,.7)', borderRadius: 4 },
            { label: 'Remaining', type: 'line', data: d.remaining, borderColor: '#d97706',
              backgroundColor: 'rgba(217,119,6,.15)', tension: .3, fill: true, yAxisID: 'y' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return v.toLocaleString('en-IN'); } } } }
        }
      });
    }

    var mixEl = document.getElementById('chartMix');
    if (mixEl && d.mix) {
      new Chart(mixEl, {
        type: 'doughnut',
        data: {
          labels: ['Online', 'Cash', 'Credit Balance'],
          datasets: [{
            data: [d.mix.online, d.mix.cash, d.mix.creditBalance],
            backgroundColor: ['#2563eb', '#16a34a', '#7c3aed']
          }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
      });
    }
  }
})();
