import re

from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm

from .models import Player

User = get_user_model()

USERNAME_RE = re.compile(r'^[A-Za-z0-9_]{3,20}$')
PASSWORD_MIN = 8


def validate_password_rules(password):
    """Пароль: от 8 символов, только латиница/цифры/знаки, есть цифра и заглавная буква."""
    errors = []
    if len(password) < PASSWORD_MIN:
        errors.append(f'Пароль должен быть не короче {PASSWORD_MIN} символов.')
    if not password.isascii():
        errors.append('Пароль — только латиницей (без кириллицы и других алфавитов).')
    if not any(c.isdigit() for c in password):
        errors.append('В пароле нужна хотя бы одна цифра.')
    if not any(c.isascii() and c.isupper() for c in password):
        errors.append('В пароле нужна хотя бы одна заглавная латинская буква.')
    return errors


class RegisterForm(forms.Form):
    username = forms.CharField(label='Имя пользователя', max_length=20,
                               help_text='3–20 символов: латинские буквы, цифры и _')
    password = forms.CharField(label='Пароль', widget=forms.PasswordInput,
                               help_text='От 8 символов, латиница, минимум одна цифра и одна заглавная буква')
    password2 = forms.CharField(label='Повторите пароль', widget=forms.PasswordInput)

    def clean_username(self):
        name = self.cleaned_data['username'].strip()
        if not USERNAME_RE.match(name):
            raise forms.ValidationError('Имя: 3–20 символов, только латинские буквы, цифры и _.')
        if User.objects.filter(username__iexact=name).exists():
            raise forms.ValidationError('Такое имя уже занято.')
        return name

    def clean_password(self):
        errors = validate_password_rules(self.cleaned_data['password'])
        if errors:
            raise forms.ValidationError(errors)
        return self.cleaned_data['password']

    def clean(self):
        data = super().clean()
        if data.get('password') and data.get('password2') and data['password'] != data['password2']:
            self.add_error('password2', 'Пароли не совпадают.')
        return data

    def save(self):
        user = User.objects.create_user(self.cleaned_data['username'], password=self.cleaned_data['password'])
        Player.objects.create(user=user)        # у нового аккаунта 10 жетонов (START_TOKENS)
        return user


class LoginForm(AuthenticationForm):
    username = forms.CharField(label='Имя пользователя')
    password = forms.CharField(label='Пароль', widget=forms.PasswordInput)
    error_messages = {**AuthenticationForm.error_messages,
                      'invalid_login': 'Неверное имя пользователя или пароль.'}
