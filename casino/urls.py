from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('roulette/', views.roulette, name='roulette'),
    path('roulette/spin/', views.roulette_spin, name='roulette_spin'),
    path('slots/', views.slots, name='slots'),
    path('slots/spin/', views.slots_spin, name='slots_spin'),
]
