from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from . import games
from .models import Player


class GamesTests(SimpleTestCase):
    def test_roulette_groups_have_nine_numbers_each(self):
        groups = {}
        for i in range(1, len(games.WHEEL)):
            p = games.pocket(i)
            groups.setdefault((p['color'], p['parity']), []).append(p['number'])
        self.assertEqual(sorted(len(v) for v in groups.values()), [9, 9, 9, 9])
        self.assertEqual(sorted(games.WHEEL), list(range(37)))

    def test_slots_pay_only_on_center_line(self):
        other = ['🍋', '🔔', '⭐']
        top_row = [['🍒'] * 3, other, other]
        middle_row = [other, ['🍒'] * 3, other]
        with patch.object(games, 'random_grid', return_value=top_row):
            self.assertFalse(games.spin_slots(1)['win'])
        with patch.object(games, 'random_grid', return_value=middle_row):
            result = games.spin_slots(2)
        self.assertTrue(result['win'])
        self.assertEqual(result['payout'], 2 * games.SLOT_PAYTABLE[0][2])


class ApiTests(TestCase):
    def post(self, name, **data):
        return self.client.post(reverse(name), data, content_type='application/json')

    def test_guest_starts_with_10_tokens(self):
        self.client.get(reverse('roulette'))
        self.assertEqual(Player.objects.get().balance, 10)

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

    def test_register_creates_account_with_start_tokens_and_logs_in(self):
        self.assertEqual(self.register().status_code, 302)
        self.assertEqual(Player.objects.get(user__username='Player_1').balance, 10)
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

    def test_secret_code(self):
        self.assertEqual(self.post('secret_code', {'code': 'нет'}).status_code, 400)
        res = self.post('secret_code', {'code': ' Месенев ТОП '})
        self.assertEqual(res.json()['balance'], 10 + games.BONUS_AMOUNT)
        self.assertEqual(self.post('secret_code', {'code': 'месенев топ'}).json()['balance'], 10 + 2 * games.BONUS_AMOUNT)
