"""Pytest configuration and fixtures."""

import pytest
import numpy as np


@pytest.fixture
def sample_embedding():
    """Generate a sample L2-normalized embedding."""
    emb = np.random.randn(512).astype(np.float32)
    emb = emb / np.linalg.norm(emb)
    return emb


@pytest.fixture
def sample_embeddings():
    """Generate sample L2-normalized embeddings."""
    embeddings = []
    for _ in range(5):
        emb = np.random.randn(512).astype(np.float32)
        emb = emb / np.linalg.norm(emb)
        embeddings.append(emb)
    return embeddings
