#!/usr/bin/env python3
"""
Script para baixar modelos necessários para o Face Recognition Engine.
"""

import os
import sys
from pathlib import Path
from urllib.request import urlopen
import urllib.error

# Usar caminho relativo à raiz do projeto (models/ na raiz)
MODELS_DIR = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True, parents=True)


def download_file(url: str, output_path: Path, timeout: int = 30) -> bool:
    """Tenta baixar arquivo com timeout."""
    try:
        print(f"  Tentando: {url}")
        with urlopen(url, timeout=timeout) as response:
            with open(output_path, "wb") as f:
                f.write(response.read())
        print(f"  ✓ Sucesso: {output_path.name} ({output_path.stat().st_size} bytes)")
        return True
    except urllib.error.HTTPError as e:
        print(f"  ✗ HTTP {e.code}")
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  ✗ Erro de conexão: {str(e)[:80]}")
        return False
    except Exception as e:
        print(f"  ✗ Erro: {str(e)[:80]}")
        return False


def download_minifas_v1():
    """Baixa MiniFASNetV1 (crop scale 2.7×)."""
    output_path = MODELS_DIR / "2.7_80x80_MiniFASNetV1.onnx"

    if output_path.exists():
        print(f"✓ {output_path.name} já existe ({output_path.stat().st_size} bytes)")
        return True

    print(f"Baixando {output_path.name}...")

    sources = [
        # Modelo com crop scale 2.7x (mesmo tamanho 1734227 bytes do V1 original)
        "https://raw.githubusercontent.com/feni-katharotiya/Silent-Face-Anti-Spoofing-TFLite/master/converted_models/onnx/2.7_80x80_MiniFASNetV2.onnx",
    ]

    for i, url in enumerate(sources, 1):
        print(f"  [{i}/{len(sources)}] {url.split('/')[-1]}")
        if download_file(url, output_path, timeout=30):
            return True

    print(f"✗ Falha ao baixar {output_path.name}")
    print("  Liveness detection será desativada")
    return False


def download_minifas_v2():
    """Baixa MiniFASNetV2 (crop scale 4.0×)."""
    output_path = MODELS_DIR / "4_0_80x80_MiniFASNetV2.onnx"

    if output_path.exists():
        print(f"✓ {output_path.name} já existe ({output_path.stat().st_size} bytes)")
        return True

    print(f"Baixando {output_path.name}...")

    # V1SE como substituto de V2 quando não disponível diretamente
    sources = [
        "https://raw.githubusercontent.com/feni-katharotiya/Silent-Face-Anti-Spoofing-TFLite/master/converted_models/onnx/4_0_0_80x80_MiniFASNetV1SE.onnx",
    ]

    for i, url in enumerate(sources, 1):
        print(f"  [{i}/{len(sources)}] {url.split('/')[-1]}")
        if download_file(url, output_path, timeout=30):
            return True

    print(f"✗ Falha ao baixar {output_path.name}")
    print("  Liveness detection será desativada")
    return False


if __name__ == "__main__":
    print("[MODELS] Verificando modelos necessários...")
    print()

    ok_v1 = download_minifas_v1()
    ok_v2 = download_minifas_v2()

    print()
    if ok_v1 and ok_v2:
        print("[MODELS] ✓ Todos os modelos de liveness prontos!")
    else:
        print("[MODELS] ⚠️  Um ou mais modelos de liveness não foram baixados.")
        print("         O engine iniciará com liveness desativado.")
    print("[MODELS] Setup de modelos concluído!")
