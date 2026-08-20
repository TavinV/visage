"""
Cache em memória de embeddings decifrados (app/infra/cache_memory.py).

O cache guarda dado biométrico em claro. O contrato mais importante não é
velocidade, é isolamento: dois tenants podem ter o mesmo `person_id` e nada
de um pode aparecer para o outro.
"""

import threading

import numpy as np
import pytest

from app.infra.cache_memory import MemoryEmbeddingCache
from tests.conftest import make_embedding

pytestmark = pytest.mark.unit


@pytest.fixture
def cache() -> MemoryEmbeddingCache:
    return MemoryEmbeddingCache()


class TestOperacoesBasicas:
    def test_get_em_tenant_desconhecido_devolve_none(self, cache):
        assert cache.get("tenant-inexistente", 1) is None

    def test_set_seguido_de_get_devolve_o_mesmo_vetor(self, cache, sample_embedding):
        cache.set("tenant-a", 1, sample_embedding)

        recuperado = cache.get("tenant-a", 1)

        assert recuperado is not None
        assert np.array_equal(recuperado, sample_embedding)

    def test_get_de_pessoa_ausente_no_tenant_conhecido_devolve_none(self, cache, sample_embedding):
        cache.set("tenant-a", 1, sample_embedding)

        assert cache.get("tenant-a", 999) is None

    def test_set_sobrescreve_o_embedding_anterior(self, cache):
        antigo, novo = make_embedding(1), make_embedding(2)
        cache.set("tenant-a", 1, antigo)
        cache.set("tenant-a", 1, novo)

        assert np.array_equal(cache.get("tenant-a", 1), novo)

    def test_person_id_string_e_inteiro_sao_chaves_distintas(self, cache):
        """Documenta o comportamento: o backend usa UUID, a engine aceita ambos."""
        cache.set("tenant-a", 1, make_embedding(1))

        assert cache.get("tenant-a", "1") is None


class TestIsolamentoEntreTenants:
    def test_mesmo_person_id_em_tenants_diferentes_nao_colide(self, cache):
        """
        Duas escolas podem ter o aluno de id 1. Se as chaves colidissem, a
        engine compararia o rosto de uma contra o embedding da outra.
        """
        emb_a, emb_b = make_embedding(10), make_embedding(20)
        cache.set("escola-a", 1, emb_a)
        cache.set("escola-b", 1, emb_b)

        assert np.array_equal(cache.get("escola-a", 1), emb_a)
        assert np.array_equal(cache.get("escola-b", 1), emb_b)
        assert not np.array_equal(cache.get("escola-a", 1), cache.get("escola-b", 1))

    def test_invalidate_atinge_so_o_tenant_alvo(self, cache):
        cache.set("escola-a", 1, make_embedding(10))
        cache.set("escola-b", 1, make_embedding(20))

        cache.invalidate("escola-a", 1)

        assert cache.get("escola-a", 1) is None
        assert cache.get("escola-b", 1) is not None

    def test_invalidate_tenant_limpa_tudo_daquela_escola_e_so_dela(self, cache):
        """Revogação de consentimento em massa e exclusão de tenant passam aqui."""
        for pid in range(3):
            cache.set("escola-a", pid, make_embedding(pid))
        cache.set("escola-b", 0, make_embedding(99))

        cache.invalidate_tenant("escola-a")

        assert all(cache.get("escola-a", pid) is None for pid in range(3))
        assert cache.get("escola-b", 0) is not None

    def test_invalidate_de_chave_inexistente_nao_estoura(self, cache):
        cache.invalidate("tenant-fantasma", 1)
        cache.invalidate_tenant("tenant-fantasma")


class TestCopiaDefensiva:
    def test_mutar_o_array_original_nao_corrompe_o_cache(self, cache):
        """
        `set` guarda cópia. Sem isso, quem chamou poderia alterar o embedding
        em claro dentro do cache depois de guardá-lo.
        """
        original = make_embedding(1)
        cache.set("tenant-a", 1, original)

        original[0] = 999.0

        assert cache.get("tenant-a", 1)[0] != 999.0

    def test_mutar_o_resultado_de_get_many_nao_corrompe_o_cache(self, cache):
        cache.set("tenant-a", 1, make_embedding(1))

        recuperados = cache.get_many("tenant-a", [1])
        recuperados[1][0] = 999.0

        assert cache.get("tenant-a", 1)[0] != 999.0


class TestGetMany:
    def test_devolve_so_os_que_estao_em_cache_sem_erro_nos_ausentes(self, cache):
        """O warm cache pede a turma inteira; parte pode não ter sido aquecida."""
        cache.set("tenant-a", 1, make_embedding(1))
        cache.set("tenant-a", 3, make_embedding(3))

        resultado = cache.get_many("tenant-a", [1, 2, 3, 4])

        assert set(resultado.keys()) == {1, 3}

    def test_tenant_desconhecido_devolve_dicionario_vazio(self, cache):
        assert cache.get_many("tenant-fantasma", [1, 2]) == {}

    def test_lista_vazia_devolve_dicionario_vazio(self, cache, sample_embedding):
        cache.set("tenant-a", 1, sample_embedding)

        assert cache.get_many("tenant-a", []) == {}


class TestEstatisticas:
    def test_contabiliza_tenants_e_embeddings(self, cache):
        cache.set("escola-a", 1, make_embedding(1))
        cache.set("escola-a", 2, make_embedding(2))
        cache.set("escola-b", 1, make_embedding(3))

        stats = cache.get_stats()

        assert stats["total_tenants"] == 2
        assert stats["total_embeddings"] == 3
        assert stats["tenants"] == {"escola-a": 2, "escola-b": 1}

    def test_cache_vazio_reporta_zeros(self, cache):
        stats = cache.get_stats()

        assert stats["total_tenants"] == 0
        assert stats["total_embeddings"] == 0


class TestConcorrencia:
    def test_escritas_paralelas_nao_perdem_registros(self, cache):
        """
        A engine roda com workers=1, mas o FastAPI atende requisições
        concorrentes na mesma thread pool — o lock precisa segurar.
        """
        erros: list[Exception] = []

        def escrever(inicio: int) -> None:
            try:
                for pid in range(inicio, inicio + 50):
                    cache.set("tenant-a", pid, make_embedding(pid))
            except Exception as exc:  # pragma: no cover - só falha se houver corrida
                erros.append(exc)

        threads = [threading.Thread(target=escrever, args=(i * 50,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not erros
        assert cache.get_stats()["total_embeddings"] == 200

    def test_leitura_durante_invalidacao_nao_estoura(self, cache):
        for pid in range(100):
            cache.set("tenant-a", pid, make_embedding(pid))

        erros: list[Exception] = []

        def ler() -> None:
            try:
                for pid in range(100):
                    cache.get("tenant-a", pid)
            except Exception as exc:  # pragma: no cover
                erros.append(exc)

        def limpar() -> None:
            try:
                cache.invalidate_tenant("tenant-a")
            except Exception as exc:  # pragma: no cover
                erros.append(exc)

        leitor, limpador = threading.Thread(target=ler), threading.Thread(target=limpar)
        leitor.start()
        limpador.start()
        leitor.join()
        limpador.join()

        assert not erros
