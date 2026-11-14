// Слоты: сервер присылает сетку 3×3, скрипт прокручивает барабаны до неё.
(() => {
  const { $, $$, sleep, post, say, lock, setBalance } = Casino;
  const game = $('#game'), machine = $('#machine'), strips = $$('.strip');
  const symbols = JSON.parse($('#symbols').textContent);
  const names = JSON.parse($('#names').textContent);
  const sym = s => `<svg class="sym" aria-hidden="true"><use href="#sym-${s}"/></svg>`;
  const randomSymbol = () => symbols[Math.floor(Math.random() * symbols.length)];

  // Кладём в барабан список символов и возвращаем его в исходное положение
  function fill(strip, items) {
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.innerHTML = items.map(s => `<div class="cell" data-s="${s}">${sym(s)}</div>`).join('');
  }

  // Крутит один барабан и останавливает его на трёх символах final (сверху вниз).
  // Лента: [новые 3][случайные символы][старые 3]. Стартуем со старых и едем вниз к новым.
  function spinReel(strip, final, index) {
    const before = $$('.cell', strip).map(c => c.dataset.s);
    const filler = Array.from({ length: 12 + index * 6 }, randomSymbol);
    const items = [...final, ...filler, ...before];
    const ms = 1500 + index * 600;                 // барабаны останавливаются по очереди

    fill(strip, items);
    strip.style.transform = `translateY(${-(items.length - 3) / items.length * 100}%)`;
    strip.getBoundingClientRect();                 // браузер фиксирует стартовое положение
    strip.style.transition = `transform ${ms}ms cubic-bezier(.25, .8, .3, 1)`;
    strip.style.transform = 'translateY(0)';
    return sleep(ms + 60).then(() => fill(strip, final));
  }

  $('#spin').addEventListener('click', async () => {
    if (Casino.balance() < 1) return say('Жетоны закончились', 'lose');
    const amount = Casino.amount;

    lock(true);
    machine.classList.remove('win');
    $$('.cell.win').forEach(c => c.classList.remove('win'));
    say('Крутим…');
    try {
      const r = await post(game.dataset.url, { amount });

      // r.grid[ряд][колонка] — двумерный массив 3×3; барабану нужна его колонка сверху вниз
      await Promise.all(strips.map((strip, i) => spinReel(strip, r.grid.map(row => row[i]), i)));

      if (r.win) {                                 // подсвечиваем выигрышные позиции (колонка, ряд)
        r.cells.forEach(([x, y]) => strips[x - 1].children[y - 1].classList.add('win'));
        machine.classList.add('win');
      }
      setBalance(r.balance);
      say(r.win ? `Три символа «${names[r.line[0]]}»! Выигрыш +${r.payout - amount}`
                : `Нет совпадений на центральной линии. Проигрыш −${amount}`,
          r.win ? 'win' : 'lose');
    } catch (err) {
      say(err.message, 'lose');
    } finally {
      lock(false);
    }
  });
})();
