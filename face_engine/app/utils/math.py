"""Mathematical utilities."""

import numpy as np


def euclidean_distance(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute euclidean distance between two vectors."""
    return float(np.linalg.norm(vec1 - vec2))


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two L2-normalized vectors."""
    return float(np.dot(vec1, vec2))


# TODO: Add more mathematical utilities
