// Мини-игры: змейка, Flappy Bird, сапёр. Награду считает сервер (minigame_finish).
(() => {
  const root = document.querySelector('.mg');
  const { $, $$ } = Casino;
  const canvas = $('#mg-canvas'), ctx = canvas.getContext('2d');
  const boardMines = $('#mg-mines'), scoreEl = $('#mg-score'), msg = $('#mg-msg'), startBtn = $('#mg-start');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  let current = 'snake', running = null;   // running: { stop() } пока идёт партия

  const icon = n => `<svg class="ic" aria-hidden="true"><use href="#sym-${n}"/></svg>`;
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

    // Рисуем: поле-вышивка, змей с золотыми ромбами на спине, молодильное яблоко
    function draw() {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#24130d' : '#2c1810'; ctx.fillRect(x * S, y * S, S, S);
        ctx.fillStyle = '#ffffff14'; ctx.fillRect(x * S + S / 2 - 1, y * S + S / 2 - 1, 2, 2);
      }
      const c = ([x, y]) => [x * S + S / 2, y * S + S / 2];
      // яблоко
      const [ax, ay] = c(apple), g = ctx.createRadialGradient(ax - 3, ay - 3, 1, ax, ay, S * .45);
      g.addColorStop(0, '#fff2a8'); g.addColorStop(.5, '#f0b429'); g.addColorStop(1, '#c7343c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ax, ay + 1, S * .36, 0, 7); ctx.fill();
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(ax + 4, ay - S * .34, 4, 2, -.6, 0, 7); ctx.fill();
      // тело: тёмная обводка + зелёная чешуя
      ctx.lineJoin = ctx.lineCap = 'round';
      [[S * .86, '#0f3d22'], [S * .68, '#2f9a55']].forEach(([w, col]) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        body.forEach((b, i) => { const [x, y] = c(b); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      });
      ctx.fillStyle = '#e8c46a';
      body.forEach((b, i) => {
        if (!i || i % 2) return;
        const [x, y] = c(b); ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.fill();
      });
      // голова: глаза и раздвоенный язык по направлению движения
      const [hx, hy] = c(body[0]), px = -dir[1], py = dir[0];
      ctx.fillStyle = '#3fb866'; ctx.beginPath(); ctx.arc(hx, hy, S * .46, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c7343c'; ctx.lineWidth = 2; ctx.beginPath();
      const tx = hx + dir[0] * S * .5, ty = hy + dir[1] * S * .5;
      ctx.moveTo(hx + dir[0] * S * .4, hy + dir[1] * S * .4); ctx.lineTo(tx, ty);
      ctx.lineTo(tx + dir[0] * 4 + px * 3, ty + dir[1] * 4 + py * 3);
      ctx.moveTo(tx, ty); ctx.lineTo(tx + dir[0] * 4 - px * 3, ty + dir[1] * 4 - py * 3); ctx.stroke();
      [-1, 1].forEach(k => {
        const ex = hx + dir[0] * S * .12 + px * k * S * .22, ey = hy + dir[1] * S * .12 + py * k * S * .22;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 7); ctx.fill();
        ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(ex + dir[0], ey + dir[1], 1.6, 0, 7); ctx.fill();
      });
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

    // Закат, солнце и ельник, плывущий назад; снизу — полоса-вышивка
    function scene(off) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2a1740'); sky.addColorStop(.55, '#8a3b4a'); sky.addColorStop(1, '#e89a5a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(W * .72, H * .68, 38, 0, 7); ctx.fill();
      [[.35, '#3a1c33', 44, 46], [.6, '#1f0f1d', 30, 32]].forEach(([k, col, w, h], n) => {
        ctx.fillStyle = col;
        const shift = (off * k) % w;
        for (let x = -w - shift; x < W + w; x += w) {
          const base = H - 10 - n * 10;
          ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + w / 2, base - h); ctx.lineTo(x + w, base); ctx.fill();
        }
      });
      ctx.fillStyle = '#3b1a0d'; ctx.fillRect(0, H - 10, W, 10);
      ctx.fillStyle = '#c7343c';
      for (let x = -((off * 2) % 14); x < W; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, H - 10); ctx.lineTo(x + 7, H - 3); ctx.lineTo(x + 14, H - 10); ctx.fill();
      }
    }
    // Резной столб с красной шапкой и золотыми зарубками; capDown — шапка внизу (верхний столб)
    function pillar(x, y0, y1, capDown) {
      const g = ctx.createLinearGradient(x, 0, x + PW, 0);
      g.addColorStop(0, '#4a2412'); g.addColorStop(.5, '#8a4a24'); g.addColorStop(1, '#4a2412');
      ctx.fillStyle = g; ctx.fillRect(x, y0, PW, y1 - y0);
      ctx.fillStyle = '#e8c46a';
      for (let yy = y0 + 8; yy < y1 - 16; yy += 22) {
        ctx.beginPath(); ctx.moveTo(x + PW / 2, yy); ctx.lineTo(x + PW / 2 + 7, yy + 7);
        ctx.lineTo(x + PW / 2, yy + 14); ctx.lineTo(x + PW / 2 - 7, yy + 7); ctx.fill();
      }
      const cy = capDown ? y1 - 14 : y0;
      ctx.fillStyle = '#c7343c'; ctx.fillRect(x - 4, cy, PW + 8, 14);
      ctx.fillStyle = '#e8c46a'; ctx.fillRect(x - 4, capDown ? cy : cy + 11, PW + 8, 3);
    }
    // Жар-птица: хвост-веер, крыло машет, наклон по скорости
    function firebird(x, y, vy, t) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.max(-.5, Math.min(.9, vy * .07)));
      ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = 14;
      ['#c7343c', '#f07a2a', '#ffd36a'].forEach((col, i) => {
        ctx.save(); ctx.rotate(Math.PI + (i - 1) * .42); ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(18, 0, 15, 4.5, 0, 0, 7); ctx.fill(); ctx.restore();
      });
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f07a2a'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#f1a82e'; ctx.beginPath(); ctx.arc(11, -5, 6.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#c7343c'; ctx.beginPath(); ctx.moveTo(16, -7); ctx.lineTo(24, -4); ctx.lineTo(16, -2); ctx.fill();
      ctx.strokeStyle = '#c7343c'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(8, -10); ctx.lineTo(5, -16); ctx.moveTo(11, -11); ctx.lineTo(11, -18); ctx.stroke();
      ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.arc(13, -6, 1.5, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(-2, -1); ctx.rotate(-.4 + Math.sin(t * .35) * .8);
      ctx.fillStyle = '#ffd36a'; ctx.strokeStyle = '#7a3a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-6, 0, 12, 5, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.restore();
    }

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
      scene(frame * .6);
      pipes.forEach(p => { pillar(p.x, 0, p.top, true); pillar(p.x, p.top + GAP, H, false); });
      firebird(BX, y, vy, frame);
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
    flagBtn.type = 'button'; flagBtn.className = 'mines-flag'; flagBtn.textContent = 'Вымпел: выкл';
    flagBtn.onclick = () => { flagMode = !flagMode; flagBtn.textContent = 'Вымпел: ' + (flagMode ? 'вкл' : 'выкл'); };
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
      c.flag = !c.flag; c.el.innerHTML = c.flag ? icon('flag') : '';
    }
    function open(i) {
      const c = cells[i]; if (over || c.open || c.flag) return;
      if (!placed) place(i);
      c.open = true; c.el.classList.add('open');
      if (c.mine) {
        over = true; c.el.classList.add('boom');
        cells.forEach(k => { if (k.mine) k.el.innerHTML = icon('mine'); });
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
