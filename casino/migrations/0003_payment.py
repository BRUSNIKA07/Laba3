import casino.models
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('casino', '0002_player_user'),
    ]

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(default=casino.models._new_label, max_length=32, unique=True)),
                ('amount_rub', models.DecimalField(decimal_places=2, max_digits=8, verbose_name='сумма, ₽')),
                ('tokens', models.PositiveIntegerField(verbose_name='жетоны')),
                ('status', models.CharField(choices=[('pending', 'ждёт оплаты'), ('paid', 'оплачен')], default='pending', max_length=10)),
                ('operation_id', models.CharField(blank=True, max_length=64, null=True, unique=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('player', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='casino.player')),
            ],
            options={'ordering': ['-created']},
        ),
    ]
