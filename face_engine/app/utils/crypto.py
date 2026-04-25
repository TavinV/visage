"""
Criptografia AES-256-GCM para embeddings.
Implementa encrypt_embedding e decrypt_embedding para persistência segura.
"""

import os
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes


class EmbeddingCrypto:
    """
    Gerenciador de criptografia de embeddings usando AES-256-GCM.
    """

    def __init__(self, aes_key_hex: str):
        """
        Inicializa com chave AES em formato hexadecimal.

        Args:
            aes_key_hex: String hexadecimal com 64 caracteres (256 bits)
        """
        self.key = bytes.fromhex(aes_key_hex)
        if len(self.key) != 32:
            raise ValueError("Chave AES deve ter 32 bytes (256 bits)")

    def encrypt_embedding(self, embedding: np.ndarray) -> tuple[bytes, bytes, bytes]:
        """
        Criptografa embedding ArcFace normalizando-o a bytes.

        O embedding é convertido para bytes binários sem base64, gerando
        exatamente 2048 bytes (512 floats * 4 bytes/float).

        Args:
            embedding: numpy.ndarray de shape (512,) e dtype float32

        Returns:
            Tupla (iv, tag, ciphertext) onde:
            - iv: 12 bytes de vetor de inicialização
            - tag: 16 bytes de tag de autenticação GCM
            - ciphertext: bytes do conteúdo criptografado
        """
        # Serializar embedding como bytes binários
        plaintext = embedding.astype(np.float32).tobytes()
        assert len(plaintext) == 2048, f"Embedding deve ter 2048 bytes, recebeu {len(plaintext)}"

        # Gerar IV aleatório (12 bytes)
        iv = os.urandom(12)

        # Criptografar com AESGCM
        cipher = AESGCM(self.key)
        ciphertext_with_tag = cipher.encrypt(iv, plaintext, None)

        # AESGCM.encrypt retorna ciphertext + tag concatenados
        # Os últimos 16 bytes são a tag de autenticação
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]

        return iv, tag, ciphertext

    def decrypt_embedding(self, iv: bytes, tag: bytes, ciphertext: bytes) -> np.ndarray:
        """
        Descriptografa embedding retornando array normalizado.

        Args:
            iv: 12 bytes de vetor de inicialização
            tag: 16 bytes de tag de autenticação GCM
            ciphertext: bytes criptografados

        Returns:
            numpy.ndarray de shape (512,) e dtype float32

        Raises:
            cryptography.hazmat.primitives.ciphers.aead.InvalidTag:
                Se a tag for inválida (dados adulterados)
        """
        # Reconstruir ciphertext + tag no formato esperado por AESGCM
        ciphertext_with_tag = ciphertext + tag

        # Descriptografar
        cipher = AESGCM(self.key)
        plaintext = cipher.decrypt(iv, ciphertext_with_tag, None)

        # Converter bytes de volta para numpy array
        # .copy() é obrigatório porque frombuffer retorna uma view somente-leitura
        embedding = np.frombuffer(plaintext, dtype=np.float32).copy()

        assert embedding.shape == (512,), f"Embedding deve ter shape (512,), recebeu {embedding.shape}"

        return embedding
