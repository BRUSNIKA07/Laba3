// Рулетка: рисуем колесо по данным сервера и крутим до сектора, который выбрал сервер.
(() => {
  const { $, $$, sleep, post, say, lock, setBalance } = Casino;
  const game = $('#game'), wheel = $('#wheel'), ball = $('#ball');
  const pockets = JSON.parse($('#pockets').textContent);
  const STEP = 360 / pockets.length;           // угол одного сектора
  const SPIN_MS = 6000;
  let bet = null, wheelAngle = 0, ballAngle = 0;

  // Точка на окружности; угол отсчитывается от верха по часовой стрелке
  const pt = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [(r * Math.sin(a)).toFixed(2), (-r * Math.cos(a)).toFixed(2)];
  };

  // Сектор i стоит под углом i * STEP, зеро — сверху
  const R_OUT = 90, R_IN = 56;
  wheel.innerHTML = '<circle r="99.5" class="rim"/>' + pockets.map((p, i) => {
    const [x0, y0] = pt(R_OUT, (i - .5) * STEP), [x1, y1] = pt(R_OUT, (i + .5) * STEP);
    const [x2, y2] = pt(R_IN, (i + .5) * STEP), [x3, y3] = pt(R_IN, (i - .5) * STEP);
    return `<g class="pocket ${p.color}" data-i="${i}">
      <path d="M${x0} ${y0}A${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${R_IN} ${R_IN} 0 0 0 ${x3} ${y3}Z"/>
      <text transform="rotate(${i * STEP}) translate(0 -${(R_IN + R_OUT) / 2})">${p.number}</text>
    </g>`;
  }).join('') + `<circle r="${R_IN}" class="cone"/><circle r="30" class="cone inner"/>
    <path d="M0-30V30M-30 0H30" class="spoke"/><circle r="5" class="hub"/>`;
  wheel.style.transitionDuration = ball.style.transitionDuration = SPIN_MS + 'ms';

  $$('.bet').forEach(btn => btn.addEventListener('click', () => {
    bet = btn.dataset.bet;
    $$('.bet').forEach(b => b.classList.toggle('active', b === btn));
  }));

  $('#spin').addEventListener('click', async () => {
    if (!bet) return say('Сначала выберите ставку', 'warn');
    if (Casino.balance() < 1) return say('Жетоны закончились', 'lose');
    const amount = Casino.amount;

    lock(true);
    $$('.pocket.hit').forEach(g => g.classList.remove('hit'));
    say('Крутим…');
    try {
      const r = await post(game.dataset.url, { bet, amount });

      // Колесо поворачивается так, чтобы выпавший сектор остановился под указателем сверху.
      // Шарик кружится в обратную сторону и тоже замирает наверху.
      const target = -r.index * STEP + (Math.random() - .5) * STEP * .7;
      wheelAngle += 360 * 5 + ((target - wheelAngle) % 360 + 360) % 360;
      ballAngle -= 360 * 7;
      wheel.style.transform = `rotate(${wheelAngle}deg)`;
      ball.style.transform = `rotate(${ballAngle}deg)`;
      await sleep(SPIN_MS + 150);

      const hit = $(`.pocket[data-i="${r.index}"]`);
      hit.classList.add('hit');
      wheel.append(hit);                       // рамка выпавшего сектора поверх соседних
      setBalance(r.balance);

      const name = r.number === 0
        ? 'зеро'
        : `${r.color === 'red' ? 'красное' : 'чёрное'} ${r.parity === 'even' ? 'чётное' : 'нечётное'}`;
      say(`Выпало ${r.number}, ${name}. ` + (r.win ? `Выигрыш +${r.payout - amount}` : `Проигрыш −${amount}`),
          r.win ? 'win' : 'lose');
    } catch (err) {
      say(err.message, 'lose');
    } finally {
      lock(false);
    }
  });
})();
