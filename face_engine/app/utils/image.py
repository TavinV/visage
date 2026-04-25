"""Image processing utilities."""

import cv2
import numpy as np


def resize_image(image: np.ndarray, max_size: int = 640) -> np.ndarray:
    """Resize image maintaining aspect ratio, max size 640px."""
    h, w = image.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        new_h, new_w = int(h * scale), int(w * scale)
        return cv2.resize(image, (new_w, new_h))
    return image


# TODO: Add more image utilities (crop, pad, etc.)
