# Roteiro de Desenvolvimento e Deployment

## Checklist de Instalação e Configuração

### 1. Ambiente Local

- [ ] Python 3.11+ instalado
- [ ] Clonar repositório
- [ ] Criar virtual environment: `python -m venv venv`
- [ ] Ativar venv: `source venv/bin/activate` (Linux/Mac) ou `venv\Scripts\activate` (Windows)
- [ ] Instalar dependências: `pip install -r requirements.txt`

### 2. Configuração

- [ ] Copiar `.env.example` para `.env`
- [ ] Gerar chave AES-256:
  ```python
  import os
  print(os.urandom(32).hex())
  ```
- [ ] Preencher `.env` com valores:
  - `AES_KEY`: Chave gerada acima (64 caracteres hex)
  - `ENGINE_API_KEY`: Chave segura para autenticação (ex: `sk-face-engine-secret-key-...`)
  - `RECOGNITION_THRESHOLD`: Padrão 1.10
  - `LIVENESS_THRESHOLD`: Padrão 0.85
  - `LIVENESS_MODEL_PATH`: Caminho para minifas.onnx
  - `PORT`: Padrão 8001

### 3. Modelos

- [ ] Criar diretório `models/`
- [ ] Baixar modelo MiniFASNet ONNX:

  ```bash
  mkdir -p models
  wget https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/model/anti_spoof_models/onnx/minifasnet.onnx -O models/minifas.onnx
  ```

  Ou alternativa Windows (usando Powershell):

  ```powershell
  New-Item -ItemType Directory -Force -Path models
  Invoke-WebRequest -Uri "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/model/anti_spoof_models/onnx/minifasnet.onnx" -OutFile "models/minifas.onnx"
  ```

### 4. Execução Local

- [ ] Iniciar servidor: `uvicorn main:app --reload --host 0.0.0.0 --port 8001`
- [ ] Verificar saúde: `curl http://localhost:8001/health -H "X-API-Key: <sua-chave>"`
- [ ] Documentação interativa: `http://localhost:8001/docs`

### 5. Testes

- [ ] Instalar pytest: `pip install pytest pytest-asyncio`
- [ ] Executar testes unitários: `python -m pytest test_engine.py -v`
- [ ] Testes de integração (com servidor rodando): `python test_integration.py`

---

## Deployment em Produção

### Opção 1: Servidor Ubuntu/Debian

#### Instalação

```bash
# 1. Clonar código
git clone <repo> /opt/face-engine
cd /opt/face-engine

# 2. Python 3.11+
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-dev

# 3. Virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 4. Dependências
pip install --upgrade pip
pip install -r requirements.txt

# 5. Configurar .env
cp .env.example .env
# Editar com valores de produção

# 6. Modelos
mkdir -p models
wget -O models/minifas.onnx https://...
```

#### Systemd Service

Criar `/etc/systemd/system/face-engine.service`:

```ini
[Unit]
Description=Face Recognition Engine
After=network.target

[Service]
Type=simple
User=appuser
WorkingDirectory=/opt/face-engine
Environment="PATH=/opt/face-engine/venv/bin"
ExecStart=/opt/face-engine/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Ativar e iniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable face-engine
sudo systemctl start face-engine
sudo systemctl status face-engine
```

#### Nginx Reverse Proxy

Criar `/etc/nginx/sites-available/face-engine`:

```nginx
upstream face_engine {
    server 127.0.0.1:8001;
}

server {
    listen 80;
    server_name api.face-engine.local;

    # Rate limiting (opcional)
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
    limit_req zone=api burst=200 nodelay;

    location / {
        proxy_pass http://face_engine;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout para detecção de face (pode ser lenta)
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
```

Ativar:

```bash
sudo ln -s /etc/nginx/sites-available/face-engine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Opção 2: Docker

Criar `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código
COPY . .

# Criar diretório de modelos
RUN mkdir -p models

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

# Executar
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
```

Criar `docker-compose.yml`:

```yaml
version: "3.8"

services:
  face-engine:
    build: .
    container_name: face-engine
    ports:
      - "8001:8001"
    environment:
      - AES_KEY=${AES_KEY}
      - ENGINE_API_KEY=${ENGINE_API_KEY}
      - RECOGNITION_THRESHOLD=1.10
      - LIVENESS_THRESHOLD=0.85
      - LIVENESS_MODEL_PATH=/app/models/minifas.onnx
      - PORT=8001
    volumes:
      - ./models:/app/models
    restart: always
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4G
```

Executar:

```bash
# Build
docker build -t face-engine:latest .

# Run com compose
docker-compose up -d

# Logs
docker-compose logs -f face-engine

# Stop
docker-compose down
```

### Opção 3: Kubernetes

Criar `deployment.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: face-engine-config
data:
  RECOGNITION_THRESHOLD: "1.10"
  LIVENESS_THRESHOLD: "0.85"
  LIVENESS_MODEL_PATH: "/app/models/minifas.onnx"
  PORT: "8001"

---
apiVersion: v1
kind: Secret
metadata:
  name: face-engine-secrets
type: Opaque
stringData:
  AES_KEY: <base64-encoded>
  ENGINE_API_KEY: <api-key>

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: face-engine
spec:
  replicas: 1 # MVP: sempre 1 para cache em memória
  selector:
    matchLabels:
      app: face-engine
  template:
    metadata:
      labels:
        app: face-engine
    spec:
      containers:
        - name: face-engine
          image: face-engine:latest
          ports:
            - containerPort: 8001
          envFrom:
            - configMapRef:
                name: face-engine-config
            - secretRef:
                name: face-engine-secrets
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8001
              httpHeaders:
                - name: X-API-Key
                  value: $(ENGINE_API_KEY)
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8001
              httpHeaders:
                - name: X-API-Key
                  value: $(ENGINE_API_KEY)
            initialDelaySeconds: 10
            periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: face-engine-service
spec:
  selector:
    app: face-engine
  type: ClusterIP
  ports:
    - port: 8001
      targetPort: 8001
```

Aplicar:

```bash
kubectl apply -f deployment.yaml
kubectl get deployments
kubectl logs deployment/face-engine
```

---

## Monitoramento

### Logs

```bash
# Local
uvicorn main:app --log-level debug

# Docker
docker-compose logs -f face-engine

# Kubernetes
kubectl logs -f deployment/face-engine
```

### Métricas (Prometheus)

Adicionar extensão a `main.py`:

```python
from prometheus_client import Counter, Histogram
from prometheus_client import make_asgi_app

# Métricas
recognize_requests = Counter(
    'recognize_requests_total',
    'Total recognition requests',
    ['status'],
)

recognize_latency = Histogram(
    'recognize_latency_ms',
    'Recognition latency in milliseconds',
)

# Endpoint Prometheus
app.add_route("/metrics", make_asgi_app())
```

### Health Checks

Verificação manual:

```bash
curl -X GET http://localhost:8001/health \
  -H "X-API-Key: sk-..."
```

---

## Troubleshooting

### CUDA não disponível (CPU apenas)

Se vir aviso de CUDA, é esperado. Modelo roda em CPU normalmente.

```python
# Verificar no código
providers = ["CPUExecutionProvider"]  # Padrão
```

### Modelo ONNX não encontrado

```bash
# Verificar se existe
ls -la models/minifas.onnx

# Dar permissões se necessário
chmod 644 models/minifas.onnx
```

### Timeout em requisições longas

Aumentar timeout no cliente:

```python
response = requests.post(
    url,
    timeout=30,  # segundos
    ...
)
```

### Cache não compartilhado entre workers

**Não use múltiplos workers**. MVP requer `workers=1`.

```bash
# ✓ Correto
uvicorn main:app --workers 1

# ✗ Errado
uvicorn main:app --workers 4
```

### InvalidTag na descriptografia

Indica que dados criptografados foram corrompidos:

1. Verificar que `AES_KEY` é a mesma entre Engine e Node.js
2. Verificar que IV, tag, ciphertext são corretos em hex
3. Verificar que dados não foram modificados em trânsito

---

## Performance Tuning

### CPU Pinning (Linux)

```bash
taskset -c 0-7 uvicorn main:app --workers 1
```

### Memory Limits

Docker:

```bash
docker run -m 4g face-engine:latest
```

Kubernetes: Ver `deployment.yaml` acima

### Compressão de Resposta

Nginx:

```nginx
gzip on;
gzip_types application/json;
```

---

## Segurança

### API Key Rotation

1. Gerar nova chave
2. Atualizar `ENGINE_API_KEY` em `.env`
3. Reiniciar serviço
4. Atualizar Node.js para usar nova chave

### SSL/TLS

```nginx
listen 443 ssl;
ssl_certificate /path/to/cert.pem;
ssl_certificate_key /path/to/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

### Backup de Modelos

```bash
tar -czf models-backup-$(date +%Y%m%d).tar.gz models/
```

---

## Observabilidade

### Tracing Distribuído (OpenTelemetry - Futuro)

Adicionar quando necessário para rastrear requisições entre Engine e Node.js.

### Alertas

Configurar alertas para:

- CPU > 80%
- Memória > 3.5GB
- Health check falho
- Latência p95 > 500ms
