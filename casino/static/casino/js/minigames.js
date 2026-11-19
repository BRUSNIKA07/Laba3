// Мини-игры: змейка, Flappy Bird, сапёр. Награду считает сервер (minigame_finish).
(() => {
  const root = document.querySelector('.mg');
  const { $, $$ } = Casino;
  const canvas = $('#mg-canvas'), ctx = canvas.getContext('2d');
  const boardMines = $('#mg-mines'), scoreEl = $('#mg-score'), msg = $('#mg-msg'), startBtn = $('#mg-start');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  let current = 'snake', running = null;   // running: { stop() } пока идёт партия

  const setScore = n => { scoreEl.textContent = 'Очки: ' + n; };

  async function finish(game, score, won) {
    running = null; startBtn.disabled = false; startBtn.textContent = 'Ещё раз';
    try {
      const r = await Casino.post(root.dataset.finish, { game, score, won });
      Casino.setBalance(r.balance);
      msg.className = 'status ' + (r.reward ? 'win' : '');
      msg.textContent = r.reward ? `Итог: ${score}. Награда: +${r.reward} жетонов` : `Итог: ${score}. Жетоны не начислены`;
    } catch (e) { msg.className = 'status lose'; msg.textContent = e.message; }
  }

  // ── Змейка ──
  function snake() {
    const N = 15, S = canvas.width / N;
    let body = [[7, 7], [6, 7], [5, 7]], dir = [1, 0], next = dir, apple = spawn(), score = 0, over = false;
    function spawn() {
      let p; do { p = [Math.random() * N | 0, Math.random() * N | 0]; }
      while (body.some(b => b[0] === p[0] && b[1] === p[1]));
      return p;
    }
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                   w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const turn = d => { if (d && (d[0] + dir[0] || d[1] + dir[1])) next = d; };
    const onKey = e => { if (keys[e.key]) { e.preventDefault(); turn(keys[e.key]); } };
    let sx, sy;
    const onTouchStart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
    const onTouchEnd = e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    };
    addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);

    function draw() {
      ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = css('--lose'); ctx.fillRect(apple[0] * S + 3, apple[1] * S + 3, S - 6, S - 6);
      ctx.fillStyle = css('--win');
      body.forEach(([x, y], i) => { ctx.globalAlpha = i ? .8 : 1; ctx.fillRect(x * S + 1, y * S + 1, S - 2, S - 2); });
      ctx.globalAlpha = 1;
    }
    const timer = setInterval(() => {
      dir = next;
      const head = [body[0][0] + dir[0], body[0][1] + dir[1]];
      const dead = head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N ||
                   body.slice(0, -1).some(b => b[0] === head[0] && b[1] === head[1]);
      if (dead) return end();
      body.unshift(head);
      if (head[0] === apple[0] && head[1] === apple[1]) { score++; setScore(score); apple = spawn(); }
      else body.pop();
      draw();
    }, 120);
    function end() {
      if (over) return; over = true; stop(); finish('snake', score, false);
    }
    function stop() {
      clearInterval(timer); removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchend', onTouchEnd);
    }
    draw();
    return { stop };
  }

  // ── Flappy Bird ──
  function flappy() {
    const W = canvas.width, H = canvas.height, GAP = 120, PW = 48, BX = 70, R = 12;
    let y = H / 2, vy = 0, pipes = [], score = 0, frame = 0, raf, over = false;
    const flap = () => { vy = -6.2; };
    const onKey = e => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } };
    addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', flap);

    function loop() {
      frame++;
      vy += 0.38; y += vy;
      if (frame % 90 === 1) pipes.push({ x: W, top: 50 + Math.random() * (H - GAP - 100), passed: false });
      pipes.forEach(p => { p.x -= 2.2; });
      pipes = pipes.filter(p => p.x > -PW);
      let hit = y < R || y > H - R;
      for (const p of pipes) {
        if (BX + R > p.x && BX - R < p.x + PW && (y - R < p.top || y + R > p.top + GAP)) hit = true;
        if (!p.passed && p.x + PW < BX - R) { p.passed = true; score++; setScore(score); }
      }
      ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = css('--green');
      pipes.forEach(p => { ctx.fillRect(p.x, 0, PW, p.top); ctx.fillRect(p.x, p.top + GAP, PW, H); });
      ctx.fillStyle = css('--brass'); ctx.beginPath(); ctx.arc(BX, y, R, 0, 7); ctx.fill();
      if (hit) return end();
      raf = requestAnimationFrame(loop);
    }
    function end() { if (over) return; over = true; stop(); finish('flappy', score, false); }
    function stop() {
      cancelAnimationFrame(raf); removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', flap);
    }
    raf = requestAnimationFrame(loop);
    return { stop };
  }

  // ── Сапёр 9×9, 10 мин ──
  function mines() {
    const N = 9, M = 10;
    let cells, opened = 0, over = false, placed = false, flagMode = false;
    boardMines.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'mines-grid';
    const flagBtn = document.createElement('button');
    flagBtn.type = 'button'; flagBtn.className = 'mines-flag'; flagBtn.textContent = '⚑ Флажок: выкл';
    flagBtn.onclick = () => { flagMode = !flagMode; flagBtn.textContent = '⚑ Флажок: ' + (flagMode ? 'вкл' : 'выкл'); };
    boardMines.append(flagBtn, grid);
    cells = Array.from({ length: N * N }, (_, i) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'cell';
      el.onclick = () => (flagMode ? flag(i) : open(i));
      el.oncontextmenu = e => { e.preventDefault(); flag(i); };
      grid.append(el);
      return { el, mine: false, n: 0, open: false, flag: false };
    });
    const near = i => {
      const x = i % N, y = i / N | 0, out = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx);
      }
      return out;
    };
    function place(safe) {                       // мины ставим после первого клика: он всегда безопасен
      const ban = new Set([safe, ...near(safe)]);
      let left = M;
      while (left) { const i = Math.random() * N * N | 0; if (!cells[i].mine && !ban.has(i)) { cells[i].mine = true; left--; } }
      cells.forEach((c, i) => { c.n = near(i).filter(j => cells[j].mine).length; });
      placed = true;
    }
    function flag(i) {
      const c = cells[i]; if (over || c.open) return;
      c.flag = !c.flag; c.el.textContent = c.flag ? '⚑' : '';
    }
    function open(i) {
      const c = cells[i]; if (over || c.open || c.flag) return;
      if (!placed) place(i);
      c.open = true; c.el.classList.add('open');
      if (c.mine) {
        over = true; c.el.classList.add('boom');
        cells.forEach(k => { if (k.mine) k.el.textContent = '✹'; });
        return finish('mines', 0, false);
      }
      opened++;
      if (c.n) { c.el.textContent = c.n; c.el.dataset.n = c.n; } else near(i).forEach(open);
      if (opened === N * N - M) { over = true; finish('mines', opened, true); }
    }
    setScore(0);
    return { stop() { over = true; } };
  }

  const games = { snake, flappy, mines };

  function show(game) {
    if (running) { running.stop(); running = null; }
    current = game;
    $$('.mg-tabs button').forEach(b => b.classList.toggle('active', b.dataset.game === game));
    const isMines = game === 'mines';
    canvas.hidden = isMines; boardMines.hidden = !isMines;
    boardMines.innerHTML = ''; setScore(0); msg.textContent = '';
    startBtn.disabled = false; startBtn.textContent = 'Старт';
    ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  $$('.mg-tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.game)));

  startBtn.addEventListener('click', async () => {
    if (running) running.stop();
    startBtn.disabled = true; msg.textContent = '';
    try { await Casino.post(root.dataset.start, { game: current }); }
    catch (e) { msg.className = 'status lose'; msg.textContent = e.message; startBtn.disabled = false; return; }
    setScore(0); startBtn.textContent = 'Идёт игра…';
    running = games[current]();
  });

  // Секретный код: проверяется на сервере.
  $('#mg-code').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#mg-code-input');
    try {
      const r = await Casino.post(root.dataset.code, { code: input.value });
      Casino.setBalance(r.balance);
      msg.className = 'status win'; msg.textContent = `+${r.reward} жетонов`;
    } catch (err) { msg.className = 'status lose'; msg.textContent = err.message; }
    input.value = '';
  });

  show('snake');
})();
