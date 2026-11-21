"""Пополнение жетонов: игрок вводит сумму, платит по QR банка, админ подтверждает платёж.

Курс и промокоды — здесь. Жетоны начисляются только функцией confirm(), которую
вызывает админ из /admin/ после того, как увидел деньги на своём счёте.
"""
from django.db import transaction
from django.utils import timezone

from .models import Payment

RUB_PER_TOKEN = 5                  # 5 ₽ = 1 жетон
MIN_RUB, MAX_RUB = 5, 5000         # целые рубли
MAX_OPEN_ORDERS = 5                # не больше стольких неоплаченных заказов у одного игрока

PROMO_CODES = {'казино говно': 1000}   # код (нижний регистр) → бонус в процентах от купленного


def normalize_promo(text):
    return ' '.join((text or '').split()).casefold()


def quote(amount_rub, promo=''):
    """Считает жетоны за сумму. Возвращает словарь или None, если сумма недопустима."""
    try:
        amount = int(amount_rub)
    except (ValueError, TypeError):
        return None
    if not MIN_RUB <= amount <= MAX_RUB:
        return None
    base = amount // RUB_PER_TOKEN
    percent = PROMO_CODES.get(normalize_promo(promo), 0)
    bonus = base * percent // 100
    return {'amount': amount, 'base': base, 'bonus': bonus, 'total': base + bonus,
            'promo_ok': bool(percent), 'percent': percent}


def confirm(payment):
    """Подтверждает платёж и начисляет жетоны. Повторный вызов ничего не делает. True, если начислили."""
    with transaction.atomic():
        taken = Payment.objects.filter(
            pk=payment.pk, status__in=[Payment.PENDING, Payment.CLAIMED]).update(
            status=Payment.PAID, paid_at=timezone.now())
        if not taken:
            return False
        payment.player.settle('topup', 0, payment.tokens, f'{payment.amount_rub} RUB')
    return True
