"""Pruebas del simulador y del modelo (sin red). Correr con pytest."""

from simulate_trips import simulate
from train import train
from common import TRIP_COLUMNS


def test_simulado_es_reproducible_y_etiquetado():
    a, b = simulate(), simulate()
    assert a.equals(b)
    assert a["is_simulated"].all()
    assert list(a.columns) == TRIP_COLUMNS


def test_t9_p90_nunca_menor_que_p50():
    preds = train(simulate())
    assert len(preds) == 3 * 2 * 6
    assert (preds["wait_p90"] >= preds["wait_p50"]).all()
    assert preds["seat_prob"].between(0, 1).all()


def test_forma_del_pronostico():
    preds = train(simulate()).set_index(["segment", "daytype", "hour"])
    # Peor espera de 5 a 7 am que a las 9 en día laboral.
    assert preds.loc[("AB", "weekday", 6), "wait_p50"] > preds.loc[("AB", "weekday", 9), "wait_p50"]
    # Menos asientos en la hora pico que a las 4 am.
    assert preds.loc[("AB", "weekday", 7), "seat_prob"] < preds.loc[("AB", "weekday", 4), "seat_prob"]


def test_hay_las_tres_etiquetas_de_confianza():
    n = train(simulate())["n_obs"]
    assert (n < 5).any() and ((n >= 5) & (n < 30)).any() and (n >= 30).any()
