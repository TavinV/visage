"""
Comparação vetorizada de embeddings (app/engine/comparator.py).

É a última etapa antes de a engine dizer "é o João". Um erro aqui não aparece
como exceção: aparece como presença registrada no nome errado. Os casos abaixo
cobrem os dois lados do risco — reconhecer quem não devia e não reconhecer
quem devia.

Puro numpy: não carrega nenhum modelo ONNX.
"""

import numpy as np
import pytest

from app.engine.comparator import FaceComparator

pytestmark = pytest.mark.unit


def normalizado(vetor: np.ndarray) -> np.ndarray:
    return (vetor / np.linalg.norm(vetor)).astype(np.float32)


@pytest.fixture
def comparator() -> FaceComparator:
    return FaceComparator(threshold=1.10)


class TestSemCandidatos:
    def test_dicionario_vazio_devolve_none(self, comparator, sample_embedding):
        """Turma sem nenhum aluno com biometria — nunca pode 'identificar'."""
        assert comparator.compare_one_vs_many(sample_embedding, {}) is None

    def test_compute_distances_vazio_devolve_dicionario_vazio(self, comparator, sample_embedding):
        assert comparator.compute_distances(sample_embedding, {}) == {}


class TestMatch:
    def test_embedding_identico_da_distancia_zero_e_confianca_maxima(
        self, comparator, sample_embedding
    ):
        resultado = comparator.compare_one_vs_many(sample_embedding, {7: sample_embedding})

        assert resultado is not None
        person_id, distance, confidence = resultado
        assert person_id == 7
        assert distance == pytest.approx(0.0, abs=1e-3)
        assert confidence == pytest.approx(1.0, abs=1e-3)

    def test_escolhe_o_candidato_mais_proximo_entre_varios(self, comparator, sample_embedding):
        ruido = np.random.default_rng(1).standard_normal(512).astype(np.float32) * 0.05
        quase_igual = normalizado(sample_embedding + ruido)

        candidatos = {
            1: normalizado(np.random.default_rng(2).standard_normal(512).astype(np.float32)),
            2: quase_igual,
            3: normalizado(np.random.default_rng(3).standard_normal(512).astype(np.float32)),
        }

        person_id, distance, _ = comparator.compare_one_vs_many(sample_embedding, candidatos)

        assert person_id == 2
        distancias = comparator.compute_distances(sample_embedding, candidatos)
        assert distance == pytest.approx(min(distancias.values()), abs=1e-6)

    def test_rosto_desconhecido_devolve_none_em_vez_de_quase_certo(
        self, comparator, sample_embedding
    ):
        """
        Um estranho na frente do totem tem de virar `face_not_recognized`.
        Devolver o "menos distante" seria registrar presença de terceiro.
        """
        estranho = normalizado(np.random.default_rng(99).standard_normal(512).astype(np.float32))

        # Threshold apertado: nenhum aleatório chega perto o suficiente
        comparator_rigoroso = FaceComparator(threshold=0.30)
        assert comparator_rigoroso.compare_one_vs_many(estranho, {1: sample_embedding}) is None

    def test_threshold_do_argumento_sobrepoe_o_da_instancia(self, sample_embedding):
        """A calibração por totem manda o threshold em cada request."""
        outro = normalizado(np.random.default_rng(5).standard_normal(512).astype(np.float32))
        candidatos = {1: outro}

        frouxo = FaceComparator(threshold=0.01)
        assert frouxo.compare_one_vs_many(sample_embedding, candidatos, threshold=2.0) is not None

        permissivo_por_padrao = FaceComparator(threshold=2.0)
        assert (
            permissivo_por_padrao.compare_one_vs_many(sample_embedding, candidatos, threshold=0.01)
            is None
        )

    def test_distancia_exatamente_no_threshold_e_aceita(self, sample_embedding):
        """A borda é inclusiva: só rejeita quem passa do limite."""
        distancia_alvo = 0.5
        # distance = sqrt(2(1-sim)) -> sim = 1 - d²/2
        similaridade = 1 - (distancia_alvo**2) / 2
        base = np.zeros(512, dtype=np.float32)
        base[0] = 1.0
        candidato = np.zeros(512, dtype=np.float32)
        candidato[0] = similaridade
        candidato[1] = float(np.sqrt(1 - similaridade**2))

        comparator = FaceComparator(threshold=distancia_alvo)
        assert comparator.compare_one_vs_many(base, {1: candidato}) is not None


class TestEstabilidadeNumerica:
    def test_similaridade_acima_de_um_nao_gera_nan(self, comparator):
        """
        Embeddings vindos da média do cadastro nem sempre têm norma exatamente
        1. Sem o clip, `sqrt(2(1-sim))` com sim > 1 viraria NaN, e a comparação
        com NaN é sempre falsa: o aluno certo deixaria de ser reconhecido.
        """
        base = np.zeros(512, dtype=np.float32)
        base[0] = 1.0
        levemente_maior = base * np.float32(1.0001)

        resultado = comparator.compare_one_vs_many(base, {1: levemente_maior})

        assert resultado is not None
        _, distance, confidence = resultado
        assert not np.isnan(distance)
        assert not np.isnan(confidence)

    def test_confianca_nunca_fica_negativa(self):
        """distance > 1.5 zeraria a confiança; negativa confundiria o painel."""
        base = np.zeros(512, dtype=np.float32)
        base[0] = 1.0
        oposto = -base  # distância máxima: 2.0

        comparator = FaceComparator(threshold=99.0)
        _, distance, confidence = comparator.compare_one_vs_many(base, {1: oposto})

        assert distance == pytest.approx(2.0, abs=1e-3)
        assert confidence == 0.0

    def test_distancia_nunca_e_negativa(self, comparator, sample_embeddings):
        candidatos = {i: emb for i, emb in enumerate(sample_embeddings)}
        distancias = comparator.compute_distances(sample_embeddings[0], candidatos)

        assert all(d >= 0 for d in distancias.values())


class TestIdentificadores:
    def test_person_id_string_funciona_como_inteiro(self, comparator, sample_embedding):
        """O backend manda UUID de usuário, não inteiro — o contrato real."""
        uuid = "6f1a2b3c-0000-4000-8000-000000000001"

        resultado = comparator.compare_one_vs_many(sample_embedding, {uuid: sample_embedding})

        assert resultado is not None
        assert resultado[0] == uuid

    def test_compute_distances_devolve_todos_os_candidatos(self, comparator, sample_embeddings):
        candidatos = {f"aluno-{i}": emb for i, emb in enumerate(sample_embeddings)}

        distancias = comparator.compute_distances(sample_embeddings[0], candidatos)

        assert set(distancias.keys()) == set(candidatos.keys())
        assert distancias["aluno-0"] == pytest.approx(0.0, abs=1e-3)

    def test_candidato_unico_ainda_respeita_o_threshold(self, sample_embedding):
        """Turma de um aluno só não pode virar identificação automática."""
        outro = normalizado(np.random.default_rng(7).standard_normal(512).astype(np.float32))

        comparator = FaceComparator(threshold=0.10)
        assert comparator.compare_one_vs_many(sample_embedding, {1: outro}) is None
