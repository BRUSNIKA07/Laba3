from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from . import games, payments
from .models import Payment, Player


class GamesTests(SimpleTestCase):
    def test_roulette_groups_have_nine_numbers_each(self):
        groups = {}
        for i in range(1, len(games.WHEEL)):
            p = games.pocket(i)
            groups.setdefault((p['color'], p['parity']), []).append(p['number'])
        self.assertEqual(sorted(len(v) for v in groups.values()), [9, 9, 9, 9])
        self.assertEqual(sorted(games.WHEEL), list(range(37)))

    def test_slots_pay_only_on_center_line(self):
        other = ['gromovik', 'lunnitsa', 'zhar']
        top_row = [['pole'] * 3, other, other]
        middle_row = [other, ['pole'] * 3, other]
        with patch.object(games, 'random_grid', return_value=top_row):
            self.assertFalse(games.spin_slots(1)['win'])
        with patch.object(games, 'random_grid', return_value=middle_row):
            result = games.spin_slots(2)
        self.assertTrue(result['win'])
        self.assertEqual(result['payout'], 2 * games.SLOT_PAYTABLE[0][2])


def fund(client, balance=10, paid=False):
    """Создаёт гостя с нужным балансом (и при необходимости с подтверждённым пополнением)."""
    client.get(reverse('roulette'))
    player = Player.objects.get()
    Player.objects.filter(pk=player.pk).update(balance=balance)
    if paid:
        Payment.objects.create(player=player, amount_rub=50, tokens=10, status=Payment.PAID)
    return player


class StartTests(TestCase):
    def test_guest_starts_with_0_tokens(self):
        self.client.get(reverse('roulette'))
        self.assertEqual(Player.objects.get().balance, 0)


class ApiTests(TestCase):
    def setUp(self):
        fund(self.client)

    def post(self, name, **data):
        return self.client.post(reverse(name), data, content_type='application/json')

    def test_bet_is_1_to_5_and_not_above_balance(self):
        self.assertEqual(self.post('slots_spin', amount=0).status_code, 400)
        self.assertEqual(self.post('slots_spin', amount=6).status_code, 400)
        Player.objects.update(balance=2)
        self.assertEqual(self.post('slots_spin', amount=3).status_code, 400)

    def test_roulette_spin_updates_balance(self):
        data = self.post('roulette_spin', bet='red_even', amount=3).json()
        self.assertEqual(data['balance'], 10 - 3 + data['payout'])
        self.assertEqual(Player.objects.get().balance, data['balance'])


class AccountTests(TestCase):
    def register(self, name='Player_1', pw='Secret123'):
        return self.client.post(reverse('register'), {'username': name, 'password': pw, 'password2': pw})

    def test_register_creates_account_with_zero_tokens_and_logs_in(self):
        self.assertEqual(self.register().status_code, 302)
        self.assertEqual(Player.objects.get(user__username='Player_1').balance, 0)
        self.assertEqual(self.client.get(reverse('roulette')).status_code, 200)

    def test_weak_passwords_rejected(self):
        for pw in ['Short1A', 'nouppercase1', 'NoDigitsHere', 'Парольь1Аа', 'пароль12345']:
            self.assertEqual(self.register(pw=pw).status_code, 200, pw)
        self.assertEqual(Player.objects.filter(user__isnull=False).count(), 0)

    def test_balance_saved_between_logins(self):
        self.register()
        Player.objects.filter(user__username='Player_1').update(balance=42)
        self.client.post(reverse('logout'))
        self.client.post(reverse('login'), {'username': 'Player_1', 'password': 'Secret123'})
        self.assertEqual(Player.for_request(self.client.get(reverse('roulette')).wsgi_request).balance, 42)


class MinigameTests(TestCase):
    def setUp(self):
        fund(self.client, paid=True)

    def test_reward_rules(self):
        self.assertEqual(games.minigame_reward('snake', 9, False, 60), 3)
        self.assertEqual(games.minigame_reward('snake', 999, False, 600), games.MINIGAME_CAP)
        self.assertEqual(games.minigame_reward('snake', 30, False, 2), 0)        # слишком быстро
        self.assertEqual(games.minigame_reward('flappy', 6, False, 30), 2)
        self.assertEqual(games.minigame_reward('mines', 71, True, 60), 8)
        self.assertEqual(games.minigame_reward('mines', 71, True, 1), 0)
        self.assertEqual(games.minigame_reward('mines', 5, False, 60), 0)

    def post(self, name, data):
        return self.client.post(reverse(name), data, content_type='application/json')

    def test_finish_needs_start_and_credits_balance(self):
        self.assertEqual(self.post('minigame_finish', {'game': 'snake', 'score': 9}).status_code, 400)
        with patch('casino.views.time.time', return_value=1000.0):
            self.post('minigame_start', {'game': 'snake'})
        with patch('casino.views.time.time', return_value=1100.0):
            res = self.post('minigame_finish', {'game': 'snake', 'score': 9})
        self.assertEqual(res.json()['reward'], 3)
        self.assertEqual(res.json()['balance'], 13)

    def test_minigames_locked_until_first_paid_topup(self):
        Payment.objects.all().delete()
        self.assertContains(self.client.get(reverse('minigames')), 'Мини-игры закрыты')
        self.assertEqual(self.post('minigame_start', {'game': 'snake'}).status_code, 400)
        self.assertEqual(self.post('minigame_finish', {'game': 'snake', 'score': 9}).status_code, 400)
        self.assertEqual(self.post('secret_code', {'code': 'Месенев топ'}).status_code, 400)
        self.assertEqual(Player.objects.get().balance, 10)
        Payment.objects.create(player=Player.objects.get(), amount_rub=50, tokens=10, status=Payment.PAID)
        self.assertNotContains(self.client.get(reverse('minigames')), 'Мини-игры закрыты')
        self.assertEqual(self.post('minigame_start', {'game': 'snake'}).status_code, 200)

    def test_secret_code(self):
        self.assertEqual(self.post('secret_code', {'code': 'нет'}).status_code, 400)
        res = self.post('secret_code', {'code': ' Месенев ТОП '})
        self.assertEqual(res.json()['balance'], 10 + games.BONUS_AMOUNT)
        self.assertEqual(self.post('secret_code', {'code': 'месенев топ'}).json()['balance'], 10 + 2 * games.BONUS_AMOUNT)


class ThimblesTests(TestCase):
    def setUp(self):
        fund(self.client)

    """Шарик всегда под стаканом 0; время подменяем, чтобы пройти проверку «не слишком быстро»."""
    def post(self, name, **data):
        return self.client.post(reverse(name), data, content_type='application/json')

    def start(self, amount):
        with patch.object(games, 'thimble_ball', return_value=0), patch('casino.views.time.time', return_value=1000.0):
            return self.post('thimbles_start', amount=amount)

    def pick(self, cup=0):
        with patch('casino.views.time.time', return_value=1010.0):
            return self.post('thimbles_pick', cup=cup)

    def next_round(self):
        with patch.object(games, 'thimble_ball', return_value=0), patch('casino.views.time.time', return_value=1000.0):
            return self.post('thimbles_round')

    def test_win_then_cashout_pays_bet_times_two(self):
        res = self.start(3).json()
        self.assertEqual((res['balance'], res['ball']), (7, 0))
        res = self.pick(0).json()
        self.assertEqual((res['multiplier'], res['ball']), (2, 0))      # ball нужен скрипту для показа
        res = self.post('thimbles_cashout').json()
        self.assertEqual((res['payout'], res['balance']), (6, 13))

    def test_super_game_raises_multiplier_each_win(self):
        self.start(2)
        self.pick(0)
        self.assertEqual(self.post('thimbles_pick', cup=0).status_code, 400)     # новый ход ещё не начат
        self.next_round()
        self.assertEqual(self.pick(0).json()['multiplier'], 3)
        self.assertEqual(self.post('thimbles_cashout').json()['payout'], 6)

    def test_miss_burns_bet_and_ends_round(self):
        self.start(2)
        self.pick(0)
        self.next_round()
        res = self.pick(1).json()
        self.assertEqual((res['win'], res['ball']), (False, 0))
        self.assertEqual(Player.objects.get().balance, 8)
        self.assertEqual(self.post('thimbles_cashout').status_code, 400)
        self.assertEqual(self.start(1).status_code, 200)

    def test_rules_are_enforced(self):
        self.assertEqual(self.pick(0).status_code, 400)                            # партии нет
        self.assertEqual(self.start(6).status_code, 400)
        self.start(1)
        self.assertEqual(self.start(1).status_code, 400)                           # уже идёт партия
        self.assertEqual(self.pick(3).status_code, 400)
        self.assertEqual(self.post('thimbles_cashout').status_code, 400)           # ещё нет побед
        with patch('casino.views.time.time', return_value=1001.0):                 # слишком быстро
            self.assertEqual(self.post('thimbles_pick', cup=0).status_code, 400)



class PaymentTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('tester', password='Passw0rdX')
        self.player = Player.objects.create(user=self.user)

    def balance(self):
        self.player.refresh_from_db()
        return self.player.balance

    def create(self, amount, promo=''):
        self.client.login(username='tester', password='Passw0rdX')
        self.client.post(reverse('topup_create'), {'amount': amount, 'promo': promo})
        return Payment.objects.first()

    def test_quote_rate_and_promo(self):
        self.assertEqual(payments.quote(100)['total'], 20)
        self.assertEqual(payments.quote(100, 'КАЗИНО ГОВНО')['total'], 220)       # +1000%
        self.assertEqual(payments.quote(100, '  казино   говно ')['total'], 220)  # регистр и пробелы
        self.assertEqual(payments.quote(100, 'другое')['total'], 20)
        self.assertIsNone(payments.quote(1))
        self.assertIsNone(payments.quote('abc'))
        self.assertIsNone(payments.quote(payments.MAX_RUB + 1))

    def test_order_is_created_with_server_side_total(self):
        order = self.create(100, 'КАЗИНО ГОВНО')
        self.assertEqual((order.tokens, order.bonus_tokens, order.status), (220, 200, Payment.PENDING))
        self.assertEqual(self.balance(), 0)                      # пока не подтверждено — ничего не начислено

    def test_confirm_credits_once_and_promo_works_on_every_order(self):
        order = self.create(100, 'КАЗИНО ГОВНО')
        self.assertTrue(payments.confirm(order))
        self.assertFalse(payments.confirm(order))                  # повтор не начисляет
        self.assertEqual(self.balance(), 220)
        self.assertTrue(payments.confirm(self.create(50, 'КАЗИНО ГОВНО')))
        self.assertEqual(self.balance(), 220 + 110)

    def test_claim_does_not_credit_and_guest_is_redirected(self):
        order = self.create(50)
        self.client.post(reverse('topup_order', args=[order.label]))
        order.refresh_from_db()
        self.assertEqual(order.status, Payment.CLAIMED)
        self.assertEqual(self.balance(), 0)
        self.client.logout()
        self.assertEqual(self.client.get(reverse('topup')).status_code, 302)

    def test_rejected_order_cannot_be_confirmed_by_claim_flow(self):
        order = self.create(50)
        Payment.objects.filter(pk=order.pk).update(status=Payment.REJECTED)
        self.assertFalse(payments.confirm(order))
        self.assertEqual(self.balance(), 0)

    def test_first_confirmed_payment_unlocks_minigames(self):
        order = self.create(50)
        self.assertFalse(self.player.has_paid)
        self.assertContains(self.client.get(reverse('minigames')), 'Мини-игры закрыты')
        payments.confirm(order)
        self.assertTrue(self.player.has_paid)
        self.assertNotContains(self.client.get(reverse('minigames')), 'Мини-игры закрыты')
