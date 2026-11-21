// Общий код всех страниц: тема, меню игр, меню аккаунта, помощники для игр.
const Casino = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const html = document.documentElement;

  // Тема (заготовка): атрибут data-theme на <html>, выбор помним в localStorage.
  // Палитры обеих тем — переменные в начале style.css.
  $('#theme-toggle').addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.dataset.theme = next;
    localStorage.setItem('theme', next);
  });

  // Меню игр: стрелка у левого края выдвигает панель.
  const drawer = $('#drawer'), arrow = $('#drawer-toggle');
  arrow.addEventListener('click', () => {
    arrow.setAttribute('aria-expanded', drawer.classList.toggle('open'));
  });

  // Меню аккаунта (пока без входа).
  const menu = $('#account-menu');
  $('#account-btn').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });

  // Помощники для страниц с играми.
  const csrf = $('meta[name="csrf-token"]').content;
  const status = $('#status'), controls = $('#controls'), chips = $$('.chip');

  function pick(amount) {
    api.amount = amount;
    html.style.setProperty('--amt', `"${amount}"`);          // число на фишке, лежащей на ставке
    chips.forEach(c => c.classList.toggle('active', +c.dataset.amount === amount));
  }

  function syncChips() {                                      // нельзя поставить больше, чем есть
    const balance = api.balance();
    chips.forEach(c => { c.disabled = +c.dataset.amount > balance; });
    if (api.amount > balance) pick(Math.max(balance, 1));
  }

  const api = {
    $, $$,
    amount: 1,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    balance: () => +$('[data-balance]').textContent,
    say(text, kind = '') { status.textContent = text; status.className = 'status ' + kind; },
    lock(on) { controls.disabled = on; },
    setBalance(n) { $$('[data-balance]').forEach(el => { el.textContent = n; }); syncChips(); },

    // POST с JSON и CSRF-токеном; при ошибке бросает Error с текстом от сервера
    async post(url, data) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Нет связи с сервером. Обновите страницу');
      return json;
    },
  };

  chips.forEach(c => c.addEventListener('click', () => pick(+c.dataset.amount)));
  pick(1);
  syncChips();
  return api;
})();
