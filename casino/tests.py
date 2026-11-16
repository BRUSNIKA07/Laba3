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
