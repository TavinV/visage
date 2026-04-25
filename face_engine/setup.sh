#!/bin/bash
# Script para setup e desenvolvimento local

set -e

echo "================================"
echo "Face Recognition Engine - Setup"
echo "================================"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verificar Python 3.11+
echo -e "${YELLOW}[1/6] Verificando Python...${NC}"
if ! command -v python3.11 &> /dev/null && ! command -v python3 &> /dev/null; then
    echo "❌ Python 3.11+ não encontrado"
    exit 1
fi
echo -e "${GREEN}✓ Python encontrado$(python3 --version)${NC}"

# 2. Criar virtual environment
echo -e "${YELLOW}[2/6] Criando virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment criado${NC}"
else
    echo -e "${GREEN}✓ Virtual environment já existe${NC}"
fi

# 3. Ativar e instalar dependências
echo -e "${YELLOW}[3/6] Instalando dependências...${NC}"
source venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
echo -e "${GREEN}✓ Dependências instaladas${NC}"

# 4. Configurar .env
echo -e "${YELLOW}[4/6] Configurando .env...${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    
    # Gerar chave AES-256
    AES_KEY=$(python3 -c "import os; print(os.urandom(32).hex())")
    sed -i "s/^AES_KEY=$/AES_KEY=${AES_KEY}/" .env
    
    echo -e "${GREEN}✓ .env criado com chave AES gerada${NC}"
    echo -e "${YELLOW}⚠️  Edite .env e preencha ENGINE_API_KEY${NC}"
else
    echo -e "${GREEN}✓ .env já existe${NC}"
fi

# 5. Download do modelo de liveness
echo -e "${YELLOW}[5/6] Baixando modelo de liveness...${NC}"
mkdir -p models
if [ ! -f "models/minifas.onnx" ]; then
    echo "Baixando minifas.onnx... (isso pode levar alguns minutos)"
    wget -q --show-progress \
        "https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/model/anti_spoof_models/onnx/minifasnet.onnx" \
        -O models/minifas.onnx
    echo -e "${GREEN}✓ Modelo baixado${NC}"
else
    echo -e "${GREEN}✓ Modelo já existe${NC}"
fi

# 6. Instalação de pytest (opcional)
echo -e "${YELLOW}[6/6] Instalando ferramentas de teste...${NC}"
pip install pytest pytest-asyncio requests
echo -e "${GREEN}✓ Ferramentas de teste instaladas${NC}"

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ Setup concluído com sucesso!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Próximos passos:"
echo "1. Editar .env e preencher ENGINE_API_KEY"
echo "2. Ativar ambiente: source venv/bin/activate"
echo "3. Iniciar servidor: uvicorn main:app --reload"
echo "4. Acessar docs: http://localhost:8001/docs"
echo ""
