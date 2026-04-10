// public/display/script.js
(function () {
  'use strict';

  const socket = io();
  const views = {
    idle:        document.getElementById('view-idle'),
    listening:   document.getElementById('view-listening'),
    new_expense: document.getElementById('view-new-expense'),
    tinder:      document.getElementById('view-tinder'),
  };
  const $ = id => document.getElementById(id);
  const els = {
    badge:            $('connection-badge'),
    cashIndicator:    $('cash-indicator'),
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
  };

  let state = { mode: 'idle', gastos: [], pendingExpense: null, tinderIndex: 0, defaultCash: false };

  // ── Reloj ─────────────────────────────────────────────────────────────────
  function updateClock() {
    els.clock.textContent = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('active', key === name));
  }

  function fmt(n) {
    return (n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
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

  // ── Indicador de método de pago ───────────────────────────────────────────
  function updateCashIndicator(isCash) {
    if (!els.cashIndicator) return;
    els.cashIndicator.textContent = isCash ? '💵 Efectivo' : '💳 Tarjeta';
    els.cashIndicator.className   = 'cash-badge ' + (isCash ? 'cash-cash' : 'cash-card');
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
      const meta = [
        g.cash ? '💵 Efectivo' : '💳 Tarjeta',
        g.location ? '📍 ' + g.location : null,
        g.timestamp ? '🕐 ' + new Date(g.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null,
      ].filter(Boolean).join(' · ');
      return `
        <div class="expense-item ${likeClass}">
          <span class="ei-icon">${expenseIcon(g.product)}</span>
          <div class="ei-info">
            <div class="ei-name">${g.product || 'Gasto'}</div>
            <div class="ei-meta">${meta}</div>
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
    els.tinderHint.style.display = gastos.length > 0 ? 'block' : 'none';
  }

  // ── Vista nuevo gasto ─────────────────────────────────────────────────────
  function renderNewExpense(g) {
    if (!g) {
      // Error de voz: mostrar estado de error limpio
      els.neProduct.textContent = '⚠️ Error de voz';
      els.nePrice.textContent   = '';
      els.neMeta.textContent    = 'Inclina a los lados para repetir · atrás para cancelar';
      return;
    }
    els.neProduct.textContent = expenseIcon(g.product) + ' ' + (g.product || 'Gasto');
    els.nePrice.textContent   = fmt(g.price);
    els.neMeta.textContent    = g.cash ? '💵 Efectivo' : '💳 Tarjeta';
  }

  // ── Tarjeta Tinder ────────────────────────────────────────────────────────
  function renderTinderCard(gastos, index) {
    const g = gastos[index];
    if (!g) { showView('idle'); return; }
    els.tcProduct.textContent      = expenseIcon(g.product) + ' ' + (g.product || 'Gasto');
    els.tcPrice.textContent        = fmt(g.price);
    els.tcMeta.textContent         = g.cash ? '💵 Efectivo' : '💳 Tarjeta';
    els.tinderProgress.textContent = `${index + 1} / ${gastos.length}`;
    els.tinderCard.classList.remove('anim-like', 'anim-dislike');
    els.likeIndicator.classList.remove('show');
    els.dislikeIndicator.classList.remove('show');
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
    }
  }

  // ── Eventos Socket ────────────────────────────────────────────────────────
  socket.on('connect',    () => { els.badge.className = 'badge badge-connected';    els.badge.textContent = '● Conectado'; });
  socket.on('disconnect', () => { els.badge.className = 'badge badge-disconnected'; els.badge.textContent = '● Desconectado'; });
  socket.on('state_update', applyState);

  socket.on('confirm',  () => showFeedback('✅'));
  socket.on('cancel',   () => showFeedback('❌'));
  socket.on('toggle_cash', () => {
    updateCashIndicator(state.defaultCash);
    showFeedback('💳');
  });
  socket.on('mark_like', () => {
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

  // ── Init ──────────────────────────────────────────────────────────────────
  showView('idle');
  renderStats([]);
  renderExpenseList([]);
  updateCashIndicator(false);
})();
