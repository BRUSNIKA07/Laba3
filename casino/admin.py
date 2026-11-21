from django.contrib import admin, messages

from . import payments
from .models import Payment, Player, Round

admin.site.register(Player, list_display=('id', 'balance', 'created'))
admin.site.register(Round, list_display=('player', 'game', 'bet', 'payout', 'result', 'created'))


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Здесь подтверждают платежи: увидели перевод на счёте → выбрали заказ → «Подтвердить оплату»."""
    list_display = ('reference', 'player', 'amount_rub', 'tokens', 'promo', 'status', 'created')
    list_filter = ('status',)
    readonly_fields = ('label', 'paid_at')
    actions = ['confirm_selected', 'reject_selected']

    @admin.action(description='Подтвердить оплату (начислить жетоны)')
    def confirm_selected(self, request, queryset):
        done = sum(payments.confirm(p) for p in queryset)
        self.message_user(request, f'Начислено по заказам: {done}', messages.SUCCESS)

    @admin.action(description='Отклонить заказ')
    def reject_selected(self, request, queryset):
        n = queryset.exclude(status=Payment.PAID).update(status=Payment.REJECTED)
        self.message_user(request, f'Отклонено: {n}', messages.INFO)
