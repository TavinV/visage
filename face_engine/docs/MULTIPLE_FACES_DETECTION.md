# 🎯 Detecção de Múltiplos Rostos - Face Engine

## 📋 Resumo

Quando mais de um rosto é detectado na imagem, o engine retorna:

```json
{
  "status": "multiple_faces_detected",
  "processing_ms": 45
}
```

**Comportamento:** Falha imediata, sem processamento adicional.

---

## 🔧 Implementação

### Pipeline - Step 3.5

```python
# Detectar múltiplos rostos
all_faces = face_detector.detect_all_faces(image_array, min_det_score=0.75)

if len(all_faces) > 1:
    return {
        "status": "multiple_faces_detected",
        "processing_ms": processing_ms
    }
```

---

## 📊 Statuses de Resposta

| Situação  | Status                          | Ação                 |
| --------- | ------------------------------- | -------------------- |
| 0 rostos  | `no_face_detected`              | Falha                |
| 1 rosto   | `identified` / `not_identified` | Processa normalmente |
| 2+ rostos | `multiple_faces_detected`       | Falha imediata       |

---

## 🧪 Exemplos

### Uma Pessoa ✅

```bash
curl -X POST http://localhost:8001/recognize \
  -H "X-API-Key: key" \
  -F "tenant_id=tenant1" \
  -F "image=@single_face.jpg" \
  -F 'candidates=[...]'
```

**Resposta:**

```json
{
  "status": "identified",
  "candidate_id": 123,
  "confidence": 0.95,
  "liveness_score": 0.92,
  "processing_ms": 42
}
```

### Múltiplos Rostos ❌

```bash
curl -X POST http://localhost:8001/recognize \
  -H "X-API-Key: key" \
  -F "tenant_id=tenant1" \
  -F "image=@two_faces.jpg" \
  -F 'candidates=[...]'
```

**Resposta:**

```json
{
  "status": "multiple_faces_detected",
  "processing_ms": 45
}
```

---

## ⚙️ Constantes

Em `app/engine/detector.py`:

```python
DET_SCORE_THRESHOLD = 0.75      # Confiança mínima
MIN_FACE_SIZE_PIXELS = 40       # Tamanho mínimo
```

---

## 📁 Audit

```
audit_frames/{tenant_id}/2024-04-23/
├── 1234567890123_identified_456.jpg
├── 1234567891000_multiple_faces_None.jpg        # 2+ rostos
└── 1234567892100_liveness_failed_None.jpg
```

---

## ✅ Características

✅ Simples - Apenas contagem de rostos  
✅ Rápido - Falha em ~45ms  
✅ Determinístico - Sem ambiguidades  
✅ Seguro - Sempre rejeita múltiplos rostos
