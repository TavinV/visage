"""File storage for audit frames."""

import os
from pathlib import Path


class FileStorage:
    """Manage file storage operations for audit frames."""

    def __init__(self, base_path: str = "audit_frames"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save_frame(
        self,
        frame_bytes: bytes,
        tenant_id: str,
        date_str: str,
        filename: str,
    ) -> str:
        """Save audit frame to disk."""
        frame_dir = self.base_path / tenant_id / date_str
        frame_dir.mkdir(parents=True, exist_ok=True)
        frame_path = frame_dir / filename
        frame_path.write_bytes(frame_bytes)
        return str(frame_path)


# TODO: Add more file storage operations
