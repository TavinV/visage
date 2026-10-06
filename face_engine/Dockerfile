# Bookworm: o bullseye saiu do LTS (ago/2026) e o espelho de segurança passou
# a dar 404 nos pacotes do mesa, quebrando o build
FROM python:3.11-bookworm

WORKDIR /app

# Instalar dependências do sistema necessárias para OpenCV e InsightFace.
# libgl1 (no bookworm substitui o libgl1-mesa-glx): o insightface puxa o
# opencv-python não-headless, que carrega libGL.so.1 no import
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Bibliotecas nativas (OpenBLAS/OpenMP sob numpy e onnxruntime) dimensionam
# seus pools por os.cpu_count(), que em ambientes de container pode devolver
# os núcleos do HOST — não a cota real. Sem limites, o processo abre threads
# demais para a cota disponível e a latência de inferência fica errática.
#
# Default = 1: seguro para o deploy de produção atual (1 vCPU, EasyPanel).
# Numa máquina com mais núcleos, sobrescreva via variável de ambiente na
# plataforma de deploy (não precisa rebuildar a imagem) — dev local já faz
# isso no docker-compose.yml, que roda com cota de 2 CPUs.
ENV OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

# Copiar requirements
COPY requirements.txt .

# Instalar dependências Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar código da aplicação
COPY . .

# Criar diretório para modelos
RUN mkdir -p models

# Informações da imagem
LABEL maintainer="SmartFace"
LABEL description="Face Recognition Engine API"
LABEL version="1.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

# Expor porta
EXPOSE 8001

# Comando para iniciar a aplicação
# workers=1 é obrigatório: o cache de embeddings vive na memória do processo e
# não tem TTL — com N workers, DELETE /embeddings/... invalidaria apenas um.
# A concorrência vem do pool de threads interno (ENGINE_THREAD_POOL_SIZE).
CMD ["sh", "-c", "python scripts/download_models.py && uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 1"]
