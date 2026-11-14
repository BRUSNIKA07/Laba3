// Наперстки: сервер решает, под каким стаканом шарик; скрипт только показывает перемешивание и итог.
(() => {
  const { $, $$, sleep, post, say, lock, setBalance } = Casino;
  const game = $('#game'), table = $('#table'), cups = $$('.cup', table);
  const supers = $('#supers'), superBtn = $('#super'), takeBtn = $('#take');
  const saved = JSON.parse($('#round').textContent);          // незавершённая партия (после перезагрузки) или null

  const pos = [0, 1, 2];                                       // pos[i] — на каком месте стоит стакан i
  const rnd = n => Math.floor(Math.random() * n);
  let picking = false, next = 2;                               // next — множитель за следующую победу

  const place = () => cups.forEach((c, i) => c.style.setProperty('--slot', pos[i]));
  function reset() {
    cups.forEach(c => c.classList.remove('up', 'has-ball'));
  }
  function waitPick() {
    picking = true;
    table.classList.add('picking');
    say(`Где шарик? Угадаешь — ×${next}`);
  }

  // Шарик лежит внутри своего стакана, поэтому при перестановке едет вместе с ним
  async function shuffle() {
    say('Следи за стаканом…');
    for (let k = 0; k < 8; k++) {
      const a = rnd(3), b = (a + 1 + rnd(2)) % 3;
      [pos[a], pos[b]] = [pos[b], pos[a]];
      place();
      await sleep(430);
    }
  }

  // Сначала показываем, под каким стаканом шарик (его назвал сервер), потом тасуем
  async function round(ball) {
    reset();
    cups[ball].classList.add('has-ball');
    say('Запомни, где шарик!');
    await sleep(500);
    cups[ball].classList.add('up');
    await sleep(1400);
    cups[ball].classList.remove('up');
    await sleep(600);
    await shuffle();
    waitPick();
  }

  function offer(r) {                                          // после победы: рискнуть или забрать
    next = r.next;
    superBtn.textContent = `Супер игра ×${r.next}`;
    takeBtn.textContent = `Забрать ${r.pot}`;
    supers.hidden = false;
    say(`Угадал! ×${r.multiplier} — это ${r.pot} жетонов`, 'win');
  }

  $('#play').addEventListener('click', async () => {
    if (Casino.balance() < 1) return say('Жетоны закончились', 'lose');
    lock(true);
    try {
      const r = await post(game.dataset.start, { amount: Casino.amount });
      setBalance(r.balance);
      next = r.next;
      await round(r.ball);
    } catch (err) {
      say(err.message, 'lose');
      lock(false);
    }
  });

  cups.forEach((cup, i) => cup.addEventListener('click', async () => {
    if (!picking) return;
    picking = false;
    table.classList.remove('picking');
    try {
      const r = await post(game.dataset.pick, { cup: i });
      cups[r.ball].classList.add('has-ball');
      cup.classList.add('up');
      cups[r.ball].classList.add('up');
      await sleep(1000);
      if (r.win) return offer(r);
      setBalance(r.balance);
      say(`Не угадал. Ставка сгорела: −${r.bet}`, 'lose');
      await sleep(900);
      reset();
      lock(false);
    } catch (err) {
      say(err.message, 'lose');
      reset();
      lock(false);
    }
  }));

  superBtn.addEventListener('click', async () => {
    supers.hidden = true;
    try {
      const r = await post(game.dataset.round, {});
      await round(r.ball);
    } catch (err) {
      say(err.message, 'lose');
      supers.hidden = false;
    }
  });

  takeBtn.addEventListener('click', async () => {
    supers.hidden = true;
    try {
      const r = await post(game.dataset.cashout, {});
      setBalance(r.balance);
      say(`Забрали выигрыш: +${r.payout} жетонов`, 'win');
    } catch (err) {
      say(err.message, 'lose');
    }
    reset();
    lock(false);
  });

  // Страницу перезагрузили посреди партии — продолжаем с того же места
  if (saved) {
    lock(true);
    next = saved.next;
    if (saved.ball === null) offer(saved);          // выиграл, новый ход ещё не начат
    else round(saved.ball);                         // ход идёт: покажем шарик и перетасуем заново
  }
})();
