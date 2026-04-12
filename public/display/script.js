// public/display/script.js
(function () {
  'use strict';

  const socket = io();
  const views = {
    idle:        document.getElementById('view-idle'),
    listening:   document.getElementById('view-listening'),
    new_expense: document.getElementById('view-new-expense'),
    tinder:      document.getElementById('view-tinder'),
    budget:      document.getElementById('view-budget'),
  };
  const $ = id => document.getElementById(id);
  const els = {
    badge:            $('connection-badge'),
    cashIndicator:    $('cash-indicator'),
    budgetIndicator:  $('budget-indicator'),
    clock:            $('clock'),
    totalAmount:      $('total-amount'),
    totalCount:       $('total-count'),
    statCard:         $('stat-card'),
    statCash:         $('stat-cash'),
    statLikes:        $('stat-likes'),
    statDislikes:     $('stat-dislikes'),
    expenseList:      $('expense-list'),
    tinderHint:       $('tinder-hint'),
    neProduct:        $('ne-product'),
    nePrice:          $('ne-price'),
    neMeta:           $('ne-meta'),
    tcProduct:        $('tc-product'),
    tcPrice:          $('tc-price'),
    tcMeta:           $('tc-meta'),
    tinderProgress:   $('tinder-progress'),
    tinderCard:       $('tinder-card'),
    likeIndicator:    $('tinder-like-indicator'),
    dislikeIndicator: $('tinder-dislike-indicator'),
    feedbackOverlay:  $('feedback-overlay'),
    budgetAmount:     $('budget-amount'),
    budgetCurrent:    $('budget-amount-current'),
    budgetBar:        $('budget-bar-fill'),
    budgetStatus:     $('budget-status-text'),
    budgetAlertBanner:$('budget-alert-banner'),
  };

  let state = {
    mode: 'idle', gastos: [], pendingExpense: null,
    tinderIndex: 0, defaultCash: false, budget: null,
  };

  // ── Reloj ─────────────────────────────────────────────────────────────────
  function updateClock() {
    els.clock.textContent = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => el && el.classList.toggle('active', k === name));
  }

  function fmt(n) {
    return (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  }

  function expenseIcon(name) {
    const n = (name || '').toLowerCase();
    if (/café|coffee|bar|cerveza|vino|bebida/.test(n))     return '☕';
    if (/super|mercado|compr|aliment|fruta|carne/.test(n)) return '🛒';
    if (/gasolin|carburante|parking|aparcamiento/.test(n)) return '⛽';
    if (/farmaci|medicina|médico|doctor/.test(n))          return '💊';
    if (/restaur|comid|pizza|kebab|sushi/.test(n))         return '🍽️';
    if (/ropa|zapatos|camisa|pantalon/.test(n))            return '👗';
    if (/cine|teatro|música|concert|entrada/.test(n))      return '🎭';
    if (/transporte|tren|metro|autobús|taxi|uber/.test(n)) return '🚌';
    if (/libro|librería/.test(n))                          return '📚';
    if (/gym|gimnasio|deporte/.test(n))                    return '🏋️';
    return '💳';
  }

  function updateCashIndicator(isCash) {
    if (!els.cashIndicator) return;
    els.cashIndicator.textContent = isCash ? '💵 Efectivo' : '💳 Tarjeta';
    els.cashIndicator.className   = 'cash-badge ' + (isCash ? 'cash-cash' : 'cash-card');
  }

  function updateBudgetIndicator(budget, gastos) {
    if (!els.budgetIndicator) return;
    if (!budget) {
      els.budgetIndicator.textContent = '💰 Sin tope';
      els.budgetIndicator.className   = 'budget-badge budget-none';
      return;
    }
    const total = gastos.reduce((s, g) => s + (g.price || 0), 0);
    const pct   = Math.min((total / budget) * 100, 100);
    els.budgetIndicator.textContent = `💰 ${total.toFixed(0)}€ / ${budget}€`;
    els.budgetIndicator.className   = 'budget-badge ' +
      (pct >= 100 ? 'budget-danger' : pct >= 75 ? 'budget-warning' : 'budget-ok');
  }

  // ── Lista de gastos ───────────────────────────────────────────────────────
  function renderExpenseList(gastos) {
    if (!gastos || gastos.length === 0) {
      els.expenseList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📳</div>
          <div>Sacude el móvil para registrar tu primer gasto</div>
        </div>`;
      return;
    }
    const recent = [...gastos].reverse().slice(0, 8);
    els.expenseList.innerHTML = recent.map(g => {
      const likeClass = g.like === true ? 'liked' : g.like === false ? 'disliked' : '';
      const likeIcon  = g.like === true ? '💚' : g.like === false ? '❌' : '';
      const metaParts = [
        g.cash ? '💵 Efectivo' : '💳 Tarjeta',
        g.location ? '📍 ' + g.location : null,
        g.timestamp ? '⏰ ' + fmtDate(g.timestamp) : null,
      ].filter(Boolean);
      return `
        <div class="expense-item ${likeClass}">
          <span class="ei-icon">${expenseIcon(g.product)}</span>
          <div class="ei-info">
            <div class="ei-name">${g.product || 'Gasto'}</div>
            <div class="ei-meta">${metaParts.join(' · ')}</div>
          </div>
          <div class="ei-price">${fmt(g.price)}</div>
          ${likeIcon ? `<div class="ei-like">${likeIcon}</div>` : ''}
        </div>`;
    }).join('');
  }

  // ── Estadísticas ──────────────────────────────────────────────────────────
  function renderStats(gastos) {
    const total    = gastos.reduce((s, g) => s + (g.price || 0), 0);
    const cashSum  = gastos.filter(g => g.cash).reduce((s, g) => s + (g.price || 0), 0);
    const cardSum  = gastos.filter(g => !g.cash).reduce((s, g) => s + (g.price || 0), 0);
    const likes    = gastos.filter(g => g.like === true).length;
    const dislikes = gastos.filter(g => g.like === false).length;
    els.totalAmount.textContent  = fmt(total);
    els.totalCount.textContent   = `${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} registrado${gastos.length !== 1 ? 's' : ''}`;
    els.statCash.textContent     = fmt(cashSum);
    els.statCard.textContent     = fmt(cardSum);
    els.statLikes.textContent    = likes;
    els.statDislikes.textContent = dislikes;
    if (els.tinderHint) els.tinderHint.style.display = gastos.length > 0 ? 'block' : 'none';
  }

  // ── Vista nuevo gasto ─────────────────────────────────────────────────────
  function renderNewExpense(g) {
    if (!g) {
      els.neProduct.textContent = '⚠️ Error de voz';
      els.nePrice.textContent   = '';
      els.neMeta.textContent    = 'Inclina a los lados para repetir · atrás para cancelar';
      return;
    }
    els.neProduct.textContent = expenseIcon(g.product) + ' ' + (g.product || 'Gasto');
    els.nePrice.textContent   = fmt(g.price);
    const metaParts = [
      g.cash ? '💵 Efectivo' : '💳 Tarjeta',
      g.location ? '📍 ' + g.location : null,
    ].filter(Boolean);
    els.neMeta.textContent = metaParts.join(' · ');
  }

  // ── Tarjeta Tinder ────────────────────────────────────────────────────────
  function renderTinderCard(gastos, index) {
    const g = gastos[index];
    if (!g) { showView('idle'); return; }
    els.tcProduct.textContent      = expenseIcon(g.product) + ' ' + (g.product || 'Gasto');
    els.tcPrice.textContent        = fmt(g.price);
    const metaParts = [
      g.cash ? '💵 Efectivo' : '💳 Tarjeta',
      g.location ? '📍 ' + g.location : null,
      g.timestamp ? '⏰ ' + fmtDate(g.timestamp) : null,
    ].filter(Boolean);
    els.tcMeta.textContent         = metaParts.join(' · ');
    els.tinderProgress.textContent = `${index + 1} / ${gastos.length}`;
    els.tinderCard.classList.remove('anim-like', 'anim-dislike');
    els.likeIndicator.classList.remove('show');
    els.dislikeIndicator.classList.remove('show');
  }

  // ── Vista budget ──────────────────────────────────────────────────────────
  function renderBudget(budget, gastos) {
    const total = gastos.reduce((s, g) => s + (g.price || 0), 0);
    if (budget) {
      const pct = Math.min((total / budget) * 100, 100);
      els.budgetAmount.textContent  = fmt(budget);
      els.budgetCurrent.textContent = fmt(total);
      els.budgetBar.style.width     = pct + '%';
      els.budgetBar.className       = 'budget-bar-fill ' +
        (pct >= 100 ? 'bar-danger' : pct >= 75 ? 'bar-warning' : 'bar-ok');
      els.budgetStatus.textContent  =
        pct >= 100 ? '🚨 ¡Tope superado!'
        : pct >= 75 ? '⚠️ Cerca del límite'
        : pct >= 50 ? '💡 Mitad del tope'
        : '✅ Dentro del presupuesto';
    } else {
      els.budgetAmount.textContent  = '—';
      els.budgetCurrent.textContent = fmt(total);
      els.budgetBar.style.width     = '0%';
      els.budgetStatus.textContent  = '🎤 Escuchando cantidad…';
    }
  }

  // ── Alerta de tope ────────────────────────────────────────────────────────
  function showBudgetAlert(data) {
    if (!els.budgetAlertBanner) return;
    const colors = { danger: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    els.budgetAlertBanner.textContent   = `${data.label} (${data.total.toFixed(2)}€ / ${data.budget}€)`;
    els.budgetAlertBanner.style.background = colors[data.level] || '#3b82f6';
    els.budgetAlertBanner.classList.add('show');
    setTimeout(() => els.budgetAlertBanner.classList.remove('show'), 5000);
  }

  // ── Feedback flash ────────────────────────────────────────────────────────
  function showFeedback(emoji) {
    els.feedbackOverlay.textContent = emoji;
    els.feedbackOverlay.classList.remove('show');
    void els.feedbackOverlay.offsetWidth;
    els.feedbackOverlay.classList.add('show');
    setTimeout(() => els.feedbackOverlay.classList.remove('show'), 800);
  }

  // ── Aplicar estado ────────────────────────────────────────────────────────
  function applyState(newState) {
    state = newState;
    renderStats(state.gastos || []);
    updateCashIndicator(state.defaultCash);
    updateBudgetIndicator(state.budget, state.gastos || []);

    switch (state.mode) {
      case 'idle':
        renderExpenseList(state.gastos || []);
        showView('idle');
        break;
      case 'listening':
        showView('listening');
        break;
      case 'new_expense':
        renderNewExpense(state.pendingExpense);
        showView('new_expense');
        break;
      case 'tinder':
        renderTinderCard(state.gastos || [], state.tinderIndex || 0);
        showView('tinder');
        break;
      case 'budget':
        renderBudget(state.budget, state.gastos || []);
        showView('budget');
        break;
    }
  }

  // ── Eventos Socket ────────────────────────────────────────────────────────
  socket.on('connect',    () => { els.badge.className = 'badge badge-connected';    els.badge.textContent = '● Conectado'; });
  socket.on('disconnect', () => { els.badge.className = 'badge badge-disconnected'; els.badge.textContent = '● Desconectado'; });
  socket.on('state_update', applyState);

  socket.on('confirm',      () => showFeedback('✅'));
  socket.on('cancel',       () => showFeedback('❌'));
  socket.on('toggle_cash',  () => { updateCashIndicator(state.defaultCash); showFeedback('💳'); });
  socket.on('mark_like',    () => {
    els.likeIndicator.classList.add('show');
    els.tinderCard.classList.add('anim-like');
    showFeedback('💚');
    setTimeout(() => els.likeIndicator.classList.remove('show'), 600);
  });
  socket.on('mark_dislike', () => {
    els.dislikeIndicator.classList.add('show');
    els.tinderCard.classList.add('anim-dislike');
    showFeedback('❌');
    setTimeout(() => els.dislikeIndicator.classList.remove('show'), 600);
  });
  socket.on('budget_alert', showBudgetAlert);

  // ── Init ──────────────────────────────────────────────────────────────────
  showView('idle');
  renderStats([]);
  renderExpenseList([]);
  updateCashIndicator(false);
  updateBudgetIndicator(null, []);
})();
