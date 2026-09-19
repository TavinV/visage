"""
Sugestão de limiares da calibração (app/api/routes/calibrate.py).

O bug que motivou estes testes: com poucos ataques na amostra, a varredura parava
colada no score do ataque e sugeria vivacidade 0.00 — um limiar que deixa passar
qualquer coisa — e o cadastro sugerido saía como 1.00, que nenhum rosto real atinge.

Numpy puro: não carrega modelo ONNX.
"""

import os
from unittest import mock

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("cv2")

# app.core.config valida MASTER_KEY/ENGINE_API_KEY ao ser importado e o CI não tem
# .env. Valores fictícios só durante o import — depois restaura o ambiente, para
# não fazer os testes de integração acharem que há uma ENGINE_API_KEY real.
_env_ficticio = {
    chave: valor
    for chave, valor in {"MASTER_KEY": "0" * 64, "ENGINE_API_KEY": "teste"}.items()
    if chave not in os.environ
}
with mock.patch.dict(os.environ, _env_ficticio):
    from app.api.routes.calibrate import (  # noqa: E402
        ENROLLMENT_LIVENESS_MARGIN,
        LIVENESS_SUGGESTION_BOUNDS,
        _find_optimal_threshold,
    )

pytestmark = pytest.mark.unit

# Scores reais da calibração reportada (6 rostos reais, 1 foto na tela)
REAIS = [0.99917, 0.99138, 0.99211, 0.99991, 0.99947, 0.99941]
ATAQUE = [0.00016]


def test_vivacidade_com_um_unico_ataque_nao_cola_no_ataque():
    limiar, reais_passam, ataques_barrados, _ = _find_optimal_threshold(
        REAIS, ATAQUE, "higher_is_real", prefer=0.85, bounds=LIVENESS_SUGGESTION_BOUNDS
    )

    assert limiar > 0.5, "0.00 desligaria a proteção contra fraude"
    assert reais_passam == 1.0
    assert ataques_barrados == 1.0


def test_usa_o_padrao_quando_ele_separa_os_grupos():
    limiar, *_ = _find_optimal_threshold(
        REAIS, ATAQUE, "higher_is_real", prefer=0.85, bounds=LIVENESS_SUGGESTION_BOUNDS
    )

    assert limiar == 0.85


def test_sem_padrao_usa_o_meio_da_folga_entre_os_grupos():
    limiar, *_ = _find_optimal_threshold(REAIS, ATAQUE, "higher_is_real")

    assert min(REAIS) > limiar > max(ATAQUE)
    assert limiar == pytest.approx((min(REAIS) + max(ATAQUE)) / 2)


def test_afrouxa_abaixo_do_padrao_quando_a_camera_exige():
    # Câmera ruim: os reais ficam em ~0.7 — o padrão 0.85 barraria todos eles
    reais = [0.66, 0.72, 0.70, 0.75]
    ataques = [0.05, 0.10]

    limiar, reais_passam, ataques_barrados, _ = _find_optimal_threshold(
        reais, ataques, "higher_is_real", prefer=0.85, bounds=LIVENESS_SUGGESTION_BOUNDS
    )

    assert limiar < min(reais)
    assert reais_passam == 1.0
    assert ataques_barrados == 1.0


def test_limiar_respeita_a_faixa_que_o_backend_aceita():
    # Reais e ataque muito próximos e baixos: o meio da folga cairia abaixo de 0.5
    limiar, *_ = _find_optimal_threshold(
        [0.30, 0.32], [0.01], "higher_is_real", bounds=LIVENESS_SUGGESTION_BOUNDS
    )

    assert LIVENESS_SUGGESTION_BOUNDS[0] <= limiar <= LIVENESS_SUGGESTION_BOUNDS[1]


def test_taxas_reportadas_sao_as_do_limiar_final():
    reais = [0.60, 0.70, 0.80, 0.90]
    ataques = [0.10, 0.20, 0.65, 0.75]

    limiar, reais_passam, ataques_barrados, youden = _find_optimal_threshold(
        reais, ataques, "higher_is_real"
    )

    esperado_reais = sum(r >= limiar for r in reais) / len(reais)
    esperado_ataques = sum(a < limiar for a in ataques) / len(ataques)
    assert reais_passam == pytest.approx(esperado_reais)
    assert ataques_barrados == pytest.approx(esperado_ataques)
    assert youden == pytest.approx(esperado_reais + esperado_ataques - 1.0)


def test_saturacao_fica_no_meio_da_folga_e_nao_colada_na_tela():
    # lower_is_real: real tem saturação baixa, tela tem alta. Antes sugeria 202.9,
    # a 0.2 do ataque e a 176 do real mais saturado.
    reais = [15.4, 24.6, 26.5, 7.2, 5.9, 11.5]
    ataques = [203.1]

    limite, reais_passam, telas_barradas, _ = _find_optimal_threshold(
        reais, ataques, "lower_is_real"
    )

    assert limite == pytest.approx((max(reais) + min(ataques)) / 2)
    assert reais_passam == 1.0
    assert telas_barradas == 1.0


def test_grupos_sobrepostos_continuam_com_taxas_coerentes():
    reais = [0.5, 0.6, 0.7, 0.8, 0.9]
    ataques = [0.4, 0.55, 0.65, 0.75, 0.85]

    limiar, reais_passam, ataques_barrados, youden = _find_optimal_threshold(
        reais, ataques, "higher_is_real"
    )

    assert min(reais + ataques) < limiar < max(reais + ataques)
    assert 0.0 <= reais_passam <= 1.0
    assert 0.0 <= ataques_barrados <= 1.0
    assert youden == pytest.approx(reais_passam + ataques_barrados - 1.0)


def test_margem_do_cadastro_e_pequena():
    # o limiar de cadastro é "pior real - margem": margem grande demais deixaria
    # de ser mais rigoroso que o do dia a dia
    assert 0 < ENROLLMENT_LIVENESS_MARGIN < 0.1
