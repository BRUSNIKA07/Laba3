import uuid

from django.conf import settings
from django.db import models, transaction
from django.db.models import F

START_TOKENS = 0          # новый игрок начинает с нуля: жетоны только за пополнение


class Player(models.Model):
    """Игрок: либо учётная запись (user), либо гость, привязанный к сессии браузера."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True,
                                on_delete=models.CASCADE, related_name='player')
    balance = models.PositiveIntegerField('жетоны', default=START_TOKENS)
    created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user or "Гость"} #{self.pk}: {self.balance}'

    @property
    def has_paid(self):
        """Было ли хоть одно подтверждённое пополнение (от этого зависит доступ к мини-играм)."""
        return self.payments.filter(status='paid').exists()

    @classmethod
    def for_request(cls, request):
        """Игрок вошедшего аккаунта; иначе гость текущей сессии (создаётся с START_TOKENS жетонов)."""
        if request.user.is_authenticated:
            return cls.objects.get_or_create(user=request.user)[0]
        player = cls.objects.filter(pk=request.session.get('player_id')).first()
        if player is None:
            player = cls.objects.create()
            request.session['player_id'] = player.pk
        return player

    def settle(self, game, bet, payout, result=''):
        """Списывает ставку и начисляет выплату одной атомарной операцией.
        Возвращает False, если жетонов не хватило."""
        with transaction.atomic():
            changed = Player.objects.filter(pk=self.pk, balance__gte=bet).update(
                balance=F('balance') - bet + payout)
            if not changed:
                return False
            Round.objects.create(player=self, game=game, bet=bet, payout=payout, result=result)
        self.refresh_from_db(fields=['balance'])
        return True


class Round(models.Model):
    """Журнал сыгранных раундов (пригодится для статистики)."""
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='rounds')
    game = models.CharField(max_length=20)
    bet = models.PositiveSmallIntegerField()
    payout = models.PositiveIntegerField(default=0)   # сколько жетонов вернулось игроку
    result = models.CharField(max_length=60, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']


def _new_label():
    return uuid.uuid4().hex


class Payment(models.Model):
    """Заказ на пополнение: игрок платит по QR, админ подтверждает, тогда начисляются жетоны."""
    PENDING, CLAIMED, PAID, REJECTED = 'pending', 'claimed', 'paid', 'rejected'
    STATUSES = [(PENDING, 'ждёт оплаты'), (CLAIMED, 'игрок отметил оплату'),
                (PAID, 'оплачен'), (REJECTED, 'отклонён')]

    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='payments')
    label = models.CharField(max_length=32, unique=True, default=_new_label)
    amount_rub = models.DecimalField('сумма, ₽', max_digits=8, decimal_places=2)
    tokens = models.PositiveIntegerField('жетоны (всего)')
    bonus_tokens = models.PositiveIntegerField('из них бонус', default=0)
    promo = models.CharField('промокод', max_length=40, blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING)
    created = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created']

    @property
    def reference(self):
        """Короткий код заказа: игрок пишет его в комментарии к переводу."""
        return self.label[:6].upper()

    def __str__(self):
        return f'{self.reference}: {self.amount_rub} ₽ → {self.tokens} жет. ({self.get_status_display()})'
