import json
import time

from django.contrib.auth import login, logout
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from . import games
from .forms import LoginForm, RegisterForm
from .models import Player

AMOUNTS = range(games.MIN_BET, games.MAX_BET + 1)


# ── Страницы (отдают HTML из шаблонов) ───────────────────────────────────
def index(request):
    return redirect('roulette')


def roulette(request):
    return render(request, 'casino/roulette.html', {
        'player': Player.for_request(request),
        'active': 'roulette',
        'pockets': games.roulette_pockets(),
        'bets': games.ROULETTE_BETS,
        'multiplier': games.ROULETTE_MULTIPLIER,
        'amounts': AMOUNTS,
    })


def slots(request):
    return render(request, 'casino/slots.html', {
        'player': Player.for_request(request),
        'active': 'slots',
        'columns': list(zip(*games.random_grid())),   # grid[ряд][колонка] → по барабанам
        'symbols': [s for s, _, _ in games.SLOT_PAYTABLE],
        'paytable': games.SLOT_PAYTABLE,
        'amounts': AMOUNTS,
    })


# ── Аккаунты ─────────────────────────────────────────────────────────────
def register_view(request):
    if request.user.is_authenticated:
        return redirect('index')
    form = RegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()                      # заодно создаёт Player с 10 жетонами
        login(request, user)
        return redirect('index')
    return render(request, 'casino/register.html', {'form': form, 'player': Player.for_request(request)})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('index')
    form = LoginForm(request, data=request.POST or None)
    if request.method == 'POST' and form.is_valid():
        login(request, form.get_user())
        return redirect('index')
    return render(request, 'casino/login.html', {'form': form, 'player': Player.for_request(request)})


@require_POST
def logout_view(request):
    logout(request)
    return redirect('index')


# ── Мини-игры ────────────────────────────────────────────────────────────
def minigames(request):
    return render(request, 'casino/minigames.html', {
        'player': Player.for_request(request), 'active': 'minigames', 'cap': games.MINIGAME_CAP,
        'minigames': games.MINIGAMES,
    })


def _json_body(request):
    try:
        return json.loads(request.body)
    except (ValueError, TypeError):
        return {}


@require_POST
def minigame_start(request):
    game = _json_body(request).get('game')
    if game not in games.MINIGAMES:
        return _error('Неизвестная игра')
    request.session['mg_start'] = {'game': game, 'at': time.time()}
    return JsonResponse({'ok': True})


@require_POST
def minigame_finish(request):
    """Сервер сам считает награду: время партии берёт из своей отметки, а не от браузера."""
    data = _json_body(request)
    started = request.session.pop('mg_start', None)
    if not started or started['game'] != data.get('game'):
        return _error('Партия не начата')
    try:
        score = int(data.get('score', 0))
    except (ValueError, TypeError):
        return _error('Некорректный результат')
    reward = games.minigame_reward(started['game'], score, bool(data.get('won')), time.time() - started['at'])
    player = Player.for_request(request)
    if reward:
        player.settle(started['game'], 0, reward, f'score {score}')
    return JsonResponse({'ok': True, 'reward': reward, 'balance': player.balance})


@require_POST
def secret_code(request):
    code = str(_json_body(request).get('code', '')).strip().casefold()
    if code != games.BONUS_CODE:
        return _error('Код не подошёл')
    player = Player.for_request(request)
    player.settle('code', 0, games.BONUS_AMOUNT, 'dev code')
    return JsonResponse({'ok': True, 'reward': games.BONUS_AMOUNT, 'balance': player.balance})


# ── Ходы игры (JSON для скриптов на странице) ────────────────────────────
def _error(text):
    return JsonResponse({'ok': False, 'error': text}, status=400)


def _parse(request, player):
    """Читает JSON и проверяет ставку. Возвращает (данные, ставка, ошибка)."""
    try:
        data = json.loads(request.body)
        amount = int(data['amount'])
    except (ValueError, KeyError, TypeError):
        return None, 0, 'Некорректный запрос'
    if not games.MIN_BET <= amount <= games.MAX_BET:
        return data, amount, f'Ставка — от {games.MIN_BET} до {games.MAX_BET} жетонов'
    if amount > player.balance:
        return data, amount, 'Недостаточно жетонов'
    return data, amount, None


@require_POST
def roulette_spin(request):
    player = Player.for_request(request)
    data, amount, error = _parse(request, player)
    if not error and data.get('bet') not in [b['key'] for b in games.ROULETTE_BETS]:
        error = 'Сначала выберите ставку'
    if error:
        return _error(error)

    result = games.spin_roulette(data['bet'], amount)
    if not player.settle('roulette', amount, result['payout'], f"{result['number']} / {data['bet']}"):
        return _error('Недостаточно жетонов')
    return JsonResponse({'ok': True, **result, 'balance': player.balance})


@require_POST
def slots_spin(request):
    player = Player.for_request(request)
    data, amount, error = _parse(request, player)
    if error:
        return _error(error)

    result = games.spin_slots(amount)
    if not player.settle('slots', amount, result['payout'], ' '.join(result['line'])):
        return _error('Недостаточно жетонов')
    return JsonResponse({'ok': True, **result, 'cells': games.WIN_LINE, 'balance': player.balance})
