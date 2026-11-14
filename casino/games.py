"""Правила игр. Чистый Python без Django: легко менять и проверять отдельно."""
import random

rng = random.SystemRandom()   # результат нельзя предсказать по предыдущим

MIN_BET, MAX_BET = 1, 5

# ── Рулетка ──────────────────────────────────────────────────────────────
# Порядок чисел — как на европейском колесе (0 и 36 чисел). Цвета чередуются.
# Числа 4 и 19 поменяны местами, поэтому в каждой из четырёх групп ровно по
# 9 чисел: шансы одинаковые, выплата ×4. Зеро (зелёное) забирает ставку.
WHEEL = [0, 32, 15, 4, 19, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
         10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

ROULETTE_MULTIPLIER = 4

ROULETTE_BETS = [
    {'key': 'red_even',   'color': 'red',   'color_name': 'Красное', 'parity_name': 'чётное'},
    {'key': 'red_odd',    'color': 'red',   'color_name': 'Красное', 'parity_name': 'нечётное'},
    {'key': 'black_even', 'color': 'black', 'color_name': 'Чёрное',  'parity_name': 'чётное'},
    {'key': 'black_odd',  'color': 'black', 'color_name': 'Чёрное',  'parity_name': 'нечётное'},
]


def pocket(index):
    """Сектор колеса по позиции: номер, цвет, чётность."""
    number = WHEEL[index]
    if number == 0:
        return {'number': 0, 'color': 'green', 'parity': None}
    return {
        'number': number,
        'color': 'red' if index % 2 else 'black',
        'parity': 'even' if number % 2 == 0 else 'odd',
    }


def roulette_pockets():
    return [pocket(i) for i in range(len(WHEEL))]


def spin_roulette(bet_key, amount):
    index = rng.randrange(len(WHEEL))
    result = pocket(index)
    win = bet_key == f"{result['color']}_{result['parity']}"
    return {'index': index, **result, 'win': win,
            'payout': amount * ROULETTE_MULTIPLIER if win else 0}


# ── Слоты ────────────────────────────────────────────────────────────────
# (символ, вес выпадения, во сколько раз растёт ставка при трёх одинаковых)
SLOT_PAYTABLE = [
    ('pole', 10, 5),        # Засеянное поле
    ('gromovik', 6, 14),    # Громовик
    ('lunnitsa', 4, 35),    # Лунница
    ('zhar', 2, 120),       # Жар-птица
    ('alatyr', 1, 400),     # Алатырь
]
# Подписи символов (рисунки — в templates/casino/_sprite.html, id вида sym-<ключ>)
SLOT_NAMES = {
    'pole': 'Засеянное поле', 'gromovik': 'Громовик', 'lunnitsa': 'Лунница',
    'zhar': 'Жар-птица', 'alatyr': 'Алатырь',
}

# Выигрышные позиции (колонка, ряд), нумерация с 1: центральная линия сетки 3×3.
WIN_LINE = [(1, 2), (2, 2), (3, 2)]


def random_grid():
    """Сетка 3×3 как двумерный массив: grid[ряд][колонка]."""
    symbols = [s for s, _, _ in SLOT_PAYTABLE]
    weights = [w for _, w, _ in SLOT_PAYTABLE]
    return [rng.choices(symbols, weights, k=3) for _ in range(3)]


def spin_slots(amount):
    grid = random_grid()
    line = [grid[y - 1][x - 1] for x, y in WIN_LINE]     # считаем только центральную линию
    win = len(set(line)) == 1
    multiplier = next(m for s, _, m in SLOT_PAYTABLE if s == line[0])
    return {'grid': grid, 'line': line, 'win': win,
            'payout': amount * multiplier if win else 0}


# ── Наперстки ────────────────────────────────────────────────────────────
# Показываем, где шарик, тасуем стаканы — угадай, под каким он. Угадал — ставка ×2, дальше «супер игра»: каждая следующая победа подряд
# поднимает множитель на 1 (×3, ×4…). Промах сжигает всё; выигрыш можно забрать.
THIMBLES_CUPS = 3
THIMBLES_MIN_SEC = 3    # быстрее, чем кончится перемешивание, ответить нельзя (анти-накрутка)


def thimbles_multiplier(wins):
    """Множитель ставки после wins побед подряд (1 победа → ×2, 2 → ×3 …)."""
    return wins + 1


def thimble_ball():
    """Под каким стаканом шарик. Его показывают игроку, потом стаканы тасуют вместе с шариком."""
    return rng.randrange(THIMBLES_CUPS)


# ── Мини-игры: заработок жетонов ─────────────────────────────────────────
MINIGAME_CAP = 10            # потолок жетонов за одну партию
BONUS_CODE = 'месенев топ'   # секретный код разработчиков (сравнивается без учёта регистра)
BONUS_AMOUNT = 99999

# per — сколько очков даёт 1 жетон; min_sec_per_point — быстрее этого набрать очки физически нельзя
# (серверная проверка от накрутки). Сапёр: фиксированная награда за победу, не быстрее min_win_sec.
MINIGAMES = {
    'snake':  {'title': 'Змейка',      'per': 3, 'min_sec_per_point': 0.3},
    'flappy': {'title': 'Flappy Bird', 'per': 3, 'min_sec_per_point': 1.0},
    'mines':  {'title': 'Сапёр',       'win_reward': 8, 'min_win_sec': 5},
}


def minigame_reward(game, score, won, elapsed):
    """Жетоны за партию. Возвращает 0, если результат нереалистичен для прошедшего времени."""
    cfg = MINIGAMES[game]
    if game == 'mines':
        return min(MINIGAME_CAP, cfg['win_reward']) if won and elapsed >= cfg['min_win_sec'] else 0
    if score < 0 or score * cfg['min_sec_per_point'] > elapsed:
        return 0
    return min(MINIGAME_CAP, score // cfg['per'])
