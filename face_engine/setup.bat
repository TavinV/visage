@echo off
REM Script para setup em Windows

setlocal enabledelayedexpansion

echo ================================
echo Face Recognition Engine - Setup
echo ================================
echo.

REM Verificar Python
echo [1/6] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo Erro: Python nao encontrado
    exit /b 1
)
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo OK: Python %PYTHON_VER%
echo.

REM Criar virtual environment
echo [2/6] Criando virtual environment...
if not exist "venv" (
    python -m venv venv
    echo OK: Virtual environment criado
) else (
    echo OK: Virtual environment ja existe
)
echo.

REM Ativar e instalar dependências
echo [3/6] Instalando dependências...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
echo OK: Dependências instaladas
echo.

REM Configurar .env
echo [4/6] Configurando .env...
if not exist ".env" (
    copy .env.example .env
    echo OK: .env criado
    echo AVISO: Edite .env e preencha ENGINE_API_KEY
) else (
    echo OK: .env ja existe
)
echo.

REM Criar diretório de modelos
echo [5/6] Preparando diretório de modelos...
if not exist "models" mkdir models
echo OK: Diretorio de modelos criado
echo AVISO: Baixe minifas.onnx manualmente em:
echo https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/raw/master/model/anti_spoof_models/onnx/minifasnet.onnx
echo E salve em: models/minifas.onnx
echo.

REM Instalar pytest
echo [6/6] Instalando ferramentas de teste...
pip install pytest pytest-asyncio requests
echo OK: Ferramentas de teste instaladas
echo.

echo ================================
echo OK: Setup concluido com sucesso!
echo ================================
echo.
echo Proximos passos:
echo 1. Editar .env e preencher ENGINE_API_KEY
echo 2. Ativar ambiente: venv\Scripts\activate
echo 3. Iniciar servidor: uvicorn main:app --reload
echo 4. Acessar docs: http://localhost:8001/docs
echo.

pause
