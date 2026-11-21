// Shared interface behaviour; game outcomes and balances remain server-owned.
const Casino = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const html = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const themeButton = $('#theme-toggle');
  let themeTimer;
  function syncTheme() {
    const light = html.dataset.theme === 'light';
    themeButton?.setAttribute('aria-checked', String(light));
    themeButton?.setAttribute('title', light ? 'Включить ночную тему' : 'Включить дневную тему');
    $('meta[name="theme-color"]')?.setAttribute('content', light ? '#c8d1c6' : '#102328');
  }
  function setTheme(theme, remember = true) {
    clearTimeout(themeTimer);
    if (!motion.matches) html.classList.add('theme-transition');
    html.dataset.theme = theme === 'light' ? 'light' : 'dark';
    if (remember) { try { localStorage.setItem('theme', html.dataset.theme); } catch (_) {} }
    syncTheme();
    document.dispatchEvent(new CustomEvent('fortuna:themechange'));
    themeTimer = setTimeout(() => html.classList.remove('theme-transition'), 650);
  }
  themeButton?.addEventListener('click', () => setTheme(html.dataset.theme === 'dark' ? 'light' : 'dark'));
  addEventListener('storage', e => { if (e.key === 'theme') setTheme(e.newValue, false); });
  syncTheme();

  const accountButton = $('#account-btn'), menu = $('#account-menu');
  function closeMenu(restoreFocus = false) {
    if (!menu || menu.hidden) return;
    menu.hidden = true; accountButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) accountButton.focus();
  }
  accountButton?.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    accountButton.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.account')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(true); });
  document.addEventListener('focusin', e => { if (!e.target.closest('.account')) closeMenu(); });

  // A short touch of feedback at the actual click, including keyboard activation.
  document.addEventListener('click', e => {
    const button = e.target.closest('.spin,.bet,.mg-tabs button');
    if (!button || button.disabled || button.closest('fieldset:disabled') || motion.matches) return;
    const bounds = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'button-ripple'; ripple.setAttribute('aria-hidden', 'true');
    ripple.style.setProperty('--ripple-x', (e.detail ? e.clientX - bounds.left : bounds.width / 2) + 'px');
    ripple.style.setProperty('--ripple-y', (e.detail ? e.clientY - bounds.top : bounds.height / 2) + 'px');
    button.append(ripple); setTimeout(() => ripple.remove(), 600);
  });

  const csrf = $('meta[name="csrf-token"]')?.content || '';
  const status = $('#status'), controls = $('#controls'), chips = $$('.chip');
  let currentBalance = Number($('[data-balance]')?.textContent) || 0;
  let balanceTimer;
  function pick(amount) {
    api.amount = amount;
    html.style.setProperty('--amt', `"${amount}"`);
    chips.forEach(c => {
      const selected = Number(c.dataset.amount) === amount;
      c.classList.toggle('active', selected); c.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-stake]').forEach(el => { el.textContent = amount; });
    $$('[data-payout-multiplier]').forEach(el => { el.textContent = amount * Number(el.dataset.payoutMultiplier); });
  }
  function syncChips() {
    chips.forEach(c => { c.disabled = Number(c.dataset.amount) > currentBalance; });
    if (api.amount > currentBalance) pick(Math.max(currentBalance, 1));
  }
  const api = {
    $, $$, amount:1,
    reducedMotion: () => motion.matches,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    balance: () => currentBalance,
    say(text, kind = '') {
      if (!status) return;
      status.textContent = text; status.className = 'status ' + kind;
    },
    lock(on) {
      if (controls) controls.disabled = on;
      $('#game')?.classList.toggle('is-busy', on);
      controls?.setAttribute('aria-busy', String(on));
    },
    setBalance(n) {
      const change = n - currentBalance; currentBalance = n;
      $$('[data-balance]').forEach(el => { el.textContent = n; }); syncChips();
      const feedback = $('#balance-change');
      if (!feedback || !change) return;
      clearTimeout(balanceTimer); feedback.className = '';
      feedback.textContent = (change > 0 ? '+' : '−') + Math.abs(change);
      void feedback.offsetWidth;
      feedback.className = 'show ' + (change > 0 ? 'gain' : 'loss');
      balanceTimer = setTimeout(() => { feedback.className = ''; }, 1700);
    },
    addResult(number, color) {
      const results = $('#recent-results'); if (!results) return;
      $('.history-empty', results)?.remove();
      const item = document.createElement('span');
      item.className = 'result-number ' + color; item.textContent = number;
      item.title = `${number} — ${color === 'red' ? 'красное' : color === 'green' ? 'зеро' : 'чёрное'}`;
      results.prepend(item);
      while (results.children.length > 8) results.lastElementChild.remove();
    },
    async post(url, data) {
      let res;
      try {
        res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','X-CSRFToken':csrf}, body:JSON.stringify(data) });
      } catch (_) { throw new Error('Нет связи с сервером. Проверьте подключение и повторите.'); }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Не удалось выполнить действие. Обновите страницу.');
      return json;
    },
  };
  chips.forEach(c => c.addEventListener('click', () => pick(Number(c.dataset.amount))));
  pick(1); syncChips();
  return api;
})();
