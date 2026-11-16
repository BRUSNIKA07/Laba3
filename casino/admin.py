from django.contrib import admin

from .models import Player, Round

admin.site.register(Player, list_display=('id', 'balance', 'created'))
admin.site.register(Round, list_display=('player', 'game', 'bet', 'payout', 'result', 'created'))
