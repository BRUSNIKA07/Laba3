from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('casino', '0004_payment_manual_qr'),
    ]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='balance',
            field=models.PositiveIntegerField(default=0, verbose_name='жетоны'),
        ),
    ]
