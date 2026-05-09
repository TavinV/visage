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
