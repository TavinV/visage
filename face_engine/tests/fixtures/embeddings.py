"""Test fixtures for embeddings."""

import numpy as np


def generate_embeddings(count: int = 5) -> dict:
    """Generate test embeddings."""
    embeddings = {}
    for i in range(count):
        emb = np.random.randn(512).astype(np.float32)
        emb = emb / np.linalg.norm(emb)
        embeddings[f"person_{i}"] = emb
    return embeddings
