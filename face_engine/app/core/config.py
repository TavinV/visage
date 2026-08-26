"""
Configuração centralizada da Face Recognition Engine.
Carrega variáveis de ambiente com validação e valores padrão.
"""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """
    Configurações da aplicação carregadas de variáveis de ambiente.
    """

    # Criptografia envelope encryption (DEK/KEK)
    master_key: str
    """Chave mestre em hexadecimal (64 caracteres = 256 bits)
    Usada para descriptografar DEKs de tenants (KMS)"""

    # Autenticação
    engine_api_key: str
    """API Key para validação de requisições do Node.js"""

    # Reconhecimento facial
    recognition_threshold: float = 1.10
    """Threshold de distância euclidiana para identificação positiva"""

    # Anti-spoofing
    liveness_threshold: float = 0.85
    """Threshold de score de liveness (0.0 a 1.0)"""

    liveness_model_v1_path: str = "./models/2.7_80x80_MiniFASNetV1.onnx"
    """Caminho para MiniFASNetV1 (crop scale 2.7×)"""

    liveness_model_v2_path: str = "./models/4_0_80x80_MiniFASNetV2.onnx"
    """Caminho para MiniFASNetV2 (crop scale 4.0×)"""

    # Servidor
    port: int = 8001
    """Porta de escuta do Uvicorn"""

    # Cache
    dek_cache_ttl_hours: int = 1
    """TTL em horas para cache de DEK descritografada por tenant"""

    # ── Ajuste fino de CPU ────────────────────────────────────────────────
    # O container roda com cota de cgroup, mas os_cpu_count() enxerga TODOS os
    # núcleos do host. Sem os limites abaixo, cada sessão ONNX abre um pool
    # dimensionado pelo host e as threads brigam pela cota real — medido:
    # detecção de ~17ms vira ~1500ms com 2 CPUs de cota. Ver docs/PERFORMANCE.md.
    #
    # Os defaults abaixo assumem 1 vCPU (o deploy de produção atual, EasyPanel/
    # Hostinger KVM) — é o denominador comum seguro: numa máquina de 1 núcleo,
    # qualquer valor > 1 só troca contexto à toa sem paralelizar nada. Ambientes
    # com mais núcleos (dev local, 2 CPUs) sobrescrevem via variável de
    # ambiente no docker-compose.yml — ver serviço face-engine.

    onnx_intra_op_threads: int = 1
    """Threads por operador dentro de uma inferência ONNX.
    1 = cada requisição ocupa 1 CPU e a concorrência vem do thread pool.
    Medição (2 CPUs): intra=1 → p95 20ms; intra=2 → p95 52ms (pior cauda) —
    por isso continua 1 mesmo em máquinas com mais de 1 núcleo."""

    onnx_inter_op_threads: int = 1
    """Threads entre operadores de um grafo ONNX (paralelismo de ramos)."""

    cv2_num_threads: int = 1
    """Threads do OpenCV. Default seguro para 1 vCPU — dev local (2 CPUs)
    sobrescreve para 2 via docker-compose.yml."""

    engine_thread_pool_size: int = 1
    """Tamanho do pool que executa a inferência fora do event loop.
    Default seguro para 1 vCPU (nenhum ganho em enfileirar 2 threads num único
    núcleo) — dev local (2 CPUs) sobrescreve para 2 via docker-compose.yml."""

    detection_max_size: int = 640
    """Maior lado da imagem antes da detecção (SCRFD)."""

    save_audit_frames: bool = False
    """Grava cada frame processado em audit_frames/ (JPEG, ~90-200ms de CPU).
    Desligado por padrão: o diretório NÃO é volume montado (some ao recriar o
    container) e os frames de fraude com valor legal já são gravados pelo
    backend em fraud_frames/. Ligue apenas para depuração pontual."""

    class Config:
        env_file = ".env"
        case_sensitive = False

    def validate_master_key(self) -> None:
        """
        Valida que master_key é uma string hexadecimal com exatamente 64 caracteres.
        Levanta ValueError se inválida.
        """
        if len(self.master_key) != 64:
            raise ValueError("MASTER_KEY deve ter exatamente 64 caracteres hexadecimais (256 bits)")
        try:
            bytes.fromhex(self.master_key)
        except ValueError:
            raise ValueError("MASTER_KEY deve ser uma string hexadecimal válida")


# Instância global de configurações
settings = Settings()
settings.validate_master_key()
