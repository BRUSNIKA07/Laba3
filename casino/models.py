from django.db import models, transaction
from django.db.models import F

START_TOKENS = 10


class Player(models.Model):
    """Игрок. Пока это гость, привязанный к сессии браузера.
    Позже сюда добавится связь с учётной записью (user = OneToOneField(User))."""
    balance = models.PositiveIntegerField('жетоны', default=START_TOKENS)
    created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Игрок #{self.pk}: {self.balance}'

    @classmethod
    def for_request(cls, request):
        """Игрок текущей сессии; при первом заходе создаётся с 10 жетонами."""
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
