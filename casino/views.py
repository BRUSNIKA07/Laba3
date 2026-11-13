import json

from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from . import games
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
