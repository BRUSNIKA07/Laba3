from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('roulette/', views.roulette, name='roulette'),
    path('roulette/spin/', views.roulette_spin, name='roulette_spin'),
    path('slots/', views.slots, name='slots'),
    path('thimbles/', views.thimbles, name='thimbles'),
    path('thimbles/start/', views.thimbles_start, name='thimbles_start'),
    path('thimbles/round/', views.thimbles_round, name='thimbles_round'),
    path('thimbles/pick/', views.thimbles_pick, name='thimbles_pick'),
    path('thimbles/cashout/', views.thimbles_cashout, name='thimbles_cashout'),
    path('minigames/', views.minigames, name='minigames'),
    path('minigames/start/', views.minigame_start, name='minigame_start'),
    path('minigames/finish/', views.minigame_finish, name='minigame_finish'),
    path('minigames/code/', views.secret_code, name='secret_code'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    path('slots/spin/', views.slots_spin, name='slots_spin'),
]
