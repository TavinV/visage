"""Image preprocessing utilities for face recognition."""

import cv2
import numpy as np


def normalize_image(image: np.ndarray) -> np.ndarray:
    """Normalize image to [0, 255] uint8."""
    if image.dtype == np.float32 or image.dtype == np.float64:
        if image.max() <= 1.0:
            image = (image * 255).astype(np.uint8)
        else:
            image = image.astype(np.uint8)
    return image


def prepare_detection_image(image: np.ndarray, max_size: int = 640) -> np.ndarray:
    """Prepare image for face detection."""
    # Resize if necessary
    h, w = image.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        new_h, new_w = int(h * scale), int(w * scale)
        image = cv2.resize(image, (new_w, new_h))
    return image


# TODO: Add more preprocessing utilities
