from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('casino', '0003_payment'),
    ]

    operations = [
        migrations.RemoveField(model_name='payment', name='operation_id'),
        migrations.AddField(model_name='payment', name='bonus_tokens',
                            field=models.PositiveIntegerField(default=0, verbose_name='из них бонус')),
        migrations.AddField(model_name='payment', name='promo',
                            field=models.CharField(blank=True, max_length=40, verbose_name='промокод')),
        migrations.AlterField(model_name='payment', name='tokens',
                              field=models.PositiveIntegerField(verbose_name='жетоны (всего)')),
        migrations.AlterField(model_name='payment', name='status',
                              field=models.CharField(choices=[('pending', 'ждёт оплаты'), ('claimed', 'игрок отметил оплату'), ('paid', 'оплачен'), ('rejected', 'отклонён')], default='pending', max_length=10)),
    ]
