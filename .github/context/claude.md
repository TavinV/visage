# VisageX — Documento Completo de Projeto

> Versão MVP — Hackathon UMC 2026  
> Autores: Otávio Vinícius Flauzino de Souza  
> Última atualização: Maio 2026

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Modelo de negócio](#2-modelo-de-negócio)
3. [Análise competitiva](#3-análise-competitiva)
4. [Produto](#4-produto)
5. [Arquitetura do sistema](#5-arquitetura-do-sistema)
6. [Engine de reconhecimento facial](#6-engine-de-reconhecimento-facial)
7. [Anti-spoofing](#7-anti-spoofing)
8. [Logs de auditoria e LGPD](#8-logs-de-auditoria-e-lgpd)
9. [Estrutura de dados completa](#9-estrutura-de-dados-completa)
10. [Multi-tenancy](#10-multi-tenancy)
11. [Fluxos principais](#11-fluxos-principais)
12. [Stack tecnológica](#12-stack-tecnológica)
13. [Infraestrutura e deploy](#13-infraestrutura-e-deploy)
14. [Rotas da API Node.js](#14-rotas-da-api-nodejs)
15. [Superfícies do sistema](#15-superfícies-do-sistema)
16. [Roadmap pós-MVP](#16-roadmap-pós-mvp)
17. [Considerações legais](#17-considerações-legais)
18. [Fluxo de cadastro com QR Code](#18-fluxo-de-cadastro-com-qr-code)

---

## 1. Visão geral

O VisageX é uma plataforma de chamada escolar automatizada via
reconhecimento facial como serviço. Multi-tenant, voltado para
escolas de ensino médio, institutos técnicos e universidades.
O professor abre a chamada no painel e alunos são reconhecidos
automaticamente por um totem (tablet ou celular fixo na parede).
A lista de presença é preenchida em tempo real.

### Modos de operação por tenant

Cada tenant opera em um de dois modos, configuráveis
independentemente via `tenant_settings`:

**Com pré-presença (`pre_attendance_enabled = true`):**  
Alunos podem registrar chegada antes da chamada ser aberta.
Quando o professor inicia a chamada, as pré-presenças válidas
(dentro da janela configurada) são consolidadas automaticamente.
A chamada é encerrada pelo professor ao final da aula.

**Com checkout individual (`individual_checkout_enabled = true`):**  
A chamada é iniciada pelo professor e consolidada somente ao
fechamento. Durante a aula, o professor pode liberar saída
antecipada para alunos individuais (checkout liberado), o que
registra o horário de saída daquele aluno. A quantidade de aulas
frequentadas é contabilizada com base nos checkouts e no
encerramento da sessão.

Os dois modos são independentes entre si e do campo
`institution_type`. Uma faculdade pode habilitar pré-presença;
uma escola pode habilitar checkout individual.

### Contagem de aulas

O coordenador ou admin define, por turma no período letivo, a
quantidade total de aulas previstas (`total_classes_planned`).
Ao abrir cada sessão, o professor informa quantas aulas aquela
sessão representa (ex: aula simples = 1, aula dupla = 2).
O sistema acompanha automaticamente quantas aulas cada aluno
frequentou, permitindo cálculo de frequência percentual a
qualquer momento.

### Fluxo de cadastro de alunos (QR Code + Totem)

O cadastro biométrico dos alunos ocorre em duas etapas separadas,
sem necessidade de intervenção do admin para a fase facial:

**Etapa 1 — Secretaria/Admin cadastra dados básicos:**
Admin cadastra matrícula, nome e dados institucionais do aluno.
O sistema gera um `EnrollmentToken` (token criptograficamente seguro,
uso único, com expiração configurável) e produz um QR Code.
O QR Code é exibido no painel para impressão ou envio ao aluno.

**Etapa 2 — Aluno vai ao totem (modo cadastro):**
O aluno escaneia o QR Code em qualquer totem da instituição.
O totem entra em `registration_mode` e guia o aluno por:
a) Exibição e aceite formal do regulamento de uso de dados biométricos
(consentimento registrado em `biometric_consents` — LGPD)
b) Captura multi-frame com liveness check em cada frame
(threshold mais rigoroso que o de reconhecimento)
c) Geração do embedding consolidado (média dos frames válidos)
d) Token invalidado (uso único) — aluno pronto para ser reconhecido

Cada aluno possui um campo `facial_status` que reflete seu estado:
`none` → `consent_given` → `registered` (ou `consent_refused` / `revoked`)

### Diferencial central

Concorrentes vendem hardware proprietário com contrato de
fidelidade de 12 a 24 meses. O VisageX elimina completamente o
hardware dedicado — qualquer tablet ou celular vira um ponto de
chamada facial em menos de 5 minutos, sem técnico, sem instalação
física, sem contrato de fidelidade.

---

## 2. Modelo de negócio

### Precificação

| Plano     | Limite               | Preço      |
| --------- | -------------------- | ---------- |
| Starter   | até 5 turmas ativas  | R$ 89/mês  |
| Escola    | até 20 turmas ativas | R$ 149/mês |
| Instituto | turmas ilimitadas    | R$ 249/mês |

### Sem contrato de fidelidade

Cobrança mensal cancelável a qualquer momento. Essa é a principal
vantagem comercial sobre concorrentes que exigem 12 a 24 meses.

### Projeção de MRR

| Cenário                | Tenants | MRR estimado |
| ---------------------- | ------- | ------------ |
| Hackathon (demo)       | 2–5     | validação    |
| 3 meses pós-lançamento | 30      | ~R$ 3.500    |
| 6 meses                | 100     | ~R$ 12.000   |
| 12 meses               | 300     | ~R$ 38.000   |

---

## 3. Análise competitiva

### Sistemas existentes no mercado

A maioria das soluções de chamada escolar é manual (papel ou
planilha) ou depende de hardware dedicado com contrato longo.
Não existe solução consolidada de chamada facial para escolas
brasileiras sem hardware proprietário.

### Comparativo

| Critério            | Sistemas tradicionais | VisageX                |
| ------------------- | --------------------- | ---------------------- |
| Hardware próprio    | Obrigatório           | **Não**                |
| Infraestrutura      | Energia + cabo        | **Wi-Fi**              |
| Contrato mínimo     | 12–24 meses           | **Sem fidelidade**     |
| Anti-spoofing       | Não                   | **Sim (MiniFASNet)**   |
| Log auditável       | Não                   | **Sim (24h)**          |
| LGPD documentada    | Não                   | **Sim**                |
| Pré-presença        | Não                   | **Sim (configurável)** |
| Contagem de aulas   | Manual                | **Automático**         |
| Checkout individual | Não                   | **Sim (configurável)** |

### Posicionamento de pitch

"Sistemas de chamada atual desperdiçam 5 a 10 minutos de aula
toda vez. O VisageX faz isso em segundos — qualquer tablet vira
um ponto de chamada facial sem hardware, sem técnico, sem contrato."

---

## 4. Produto

### VisageX — Chamada Escolar

**Problema:** chamada manual desperdiça 5 a 10 minutos por aula,
é sujeita a erros, fraudes e inconsistências nos registros.
Sistemas digitais existentes exigem hardware dedicado e contrato longo.

**Solução:** totem fixo (tablet ou celular) reconhece os alunos
automaticamente enquanto entram na sala. O professor só precisa
abrir a chamada e revisar ao final.

**Fluxo de cadastro de alunos (QR Code + Totem):**

1. Admin/secretaria cadastra dados básicos do aluno no painel
2. Sistema gera QR Code único e de uso único (token com expiração)
3. QR Code é exibido no painel para impressão/envio ao aluno
4. Aluno vai a qualquer totem, aciona o modo de cadastro e escaneia o QR
5. Totem exibe o regulamento LGPD — aluno aceita formalmente (consentimento registrado)
6. Captura multi-frame com liveness check rigoroso em todos os frames
7. Embedding consolidado salvo — aluno disponível para reconhecimento

**Fluxo de uso — com pré-presença (`pre_attendance_enabled = true`):**

- Alunos passam na frente do totem ao chegar (antes ou depois da chamada abrir)
- Se a chamada ainda não foi aberta, o reconhecimento gera uma pré-presença no Redis
- Professor abre a chamada no painel web
- Pré-presenças válidas (dentro da janela configurada) são consolidadas automaticamente
- Novos reconhecimentos durante a aula atualizam a lista em tempo real via SSE
- Professor revisa e ajusta manualmente se necessário
- Professor fecha a chamada — ausentes são marcados automaticamente

**Fluxo de uso — com checkout individual (`individual_checkout_enabled = true`):**

- Professor abre a chamada no painel, informa quantas aulas a sessão representa (padrão: 1)
- Alunos passam na frente do totem ao entrar — presença registrada em tempo real
- Durante a aula, professor pode liberar checkout individual para alunos que precisam sair
- Ao encerrar a chamada, o sistema consolida: quem fez checkout registra saída; demais são marcados como presentes até o encerramento
- Contagem de aulas frequentadas é atualizada automaticamente por aluno

**Diferenciais:**

- Pré-presença (configurável por tenant): aluno reconhecido antes da chamada abrir tem presença consolidada automaticamente
- Checkout individual (configurável por tenant): professor libera saída de aluno específico com registro de horário
- Contagem de aulas: coordenador/admin define o total previsto por turma; professor informa o peso da sessão ao abrir; sistema acumula por aluno no período
- Ajuste manual com rastreabilidade de quem alterou e quando
- Relatório de frequência por aluno, turma e período letivo
- Nenhum app para instalar — totem é uma PWA no browser do tablet

---

## 5. Arquitetura do sistema

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                    Nginx                            │
│         reverse proxy · SSL · rate limit            │
└──────┬──────────────────────────┬───────────────────┘
       │                          │
       ▼                          ▼
┌─────────────┐          ┌─────────────────────┐
│   Next.js   │          │    Node.js API       │
│  porta 3000 │          │    porta 4000        │
│             │          │                      │
│  Dashboard  │          │  • JWT auth          │
│  Super Admin│          │  • tenant isolation  │
│  Totem PWA  │◀────SSE──│  • warm cache logic  │
│             │          │  • pre-attendance    │
│             │          │  • audit log save    │
└─────────────┘          └──────┬───────┬───────┘
                                │       │
                    ┌───────────┘       └──────────────┐
                    │                                   │
                    ▼                                   ▼
         ┌──────────────────┐              ┌───────────────────┐
         │   PostgreSQL 16  │              │    Redis 7        │
         │                  │              │                   │
         │  • todos os      │              │  • sessões JWT    │
         │    dados         │              │  • warm cache     │
         │    persistentes  │              │    embeddings     │
         │  • embeddings    │              │  • pré-presenças  │
         │    AES-256-GCM   │              │  • sem persistên- │
         │  • audit log     │              │    cia em disco   │
         │    metadata      │              └───────────────────┘
         └──────────────────┘
                    │
                    │ HTTP interno
                    ▼
         ┌──────────────────────────────────────┐
         │         Engine Python                │
         │         FastAPI · porta 8001         │
         │                                      │
         │  • SCRFD — detecção facial           │
         │  • MiniFASNet v1+v2 — liveness       │
         │  • ArcFace R50 — embedding 512d      │
         │  • AES-256-GCM — decrypt em RAM      │
         │  • comparação NumPy vetorizada       │
         │  • cache em memória (dict Python)    │
         │  • fraud frames (liveness_failed)    │
         │                                      │
         │  workers=2 · modelos em memória      │
         │  zero acesso ao PostgreSQL           │
         └──────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────────┐
         │     Fraud Frames (filesystem)        │
         │                                      │
         │  ./fraud_frames/                     │
         │    {tenant_id}/                      │
         │      {YYYY-MM-DD}/                   │
         │        {timestamp_ms}_failed_{id}.jpg│
         │                                      │
         │  Apenas quando: liveness_failed      │
         │    + save_fraud_frames = true        │
         │  TTL: fraud_retention_hours (padrão 24h) │
         │  Job de limpeza: diário às 03:00     │
         │  Acesso: apenas admin/manager        │
         └──────────────────────────────────────┘
```

### Decisões arquiteturais importantes

**Engine sem banco de dados.** A engine Python nunca conecta ao
PostgreSQL. Recebe embeddings criptografados no body do request
(enviados pelo Node), descriptografa em RAM, compara e retorna.
Isso elimina dependência de banco no caminho crítico de performance.

**Cache em memória na engine.** Um dicionário Python
`{tenant_id: {person_id: ndarray}}` mantém embeddings já
descriptografados em RAM entre requisições. Após o primeiro
request de uma turma, as requisições seguintes têm zero custo
de I/O e zero custo de descriptografia.

**Redis sem persistência.** Configurado com `--save ""` e
`--appendonly no`. Dados em Redis são sempre reconstituíveis
pelo Node — se cair, o Node re-popula. Isso garante que
embeddings descriptografados nunca tocam disco fora da engine.

**Warm cache proativo.** Quando uma chamada abre, o Node popula
o cache da engine com os embeddings de todos os candidatos antes
do primeiro reconhecimento. Elimina latência de cache miss no
pico de chegada.

**Workers=2 Uvicorn.** Para o MVP com até 700 usuários em pico
distribuídos em tenants, 2 workers processando ~13 reconhecimentos
por segundo cada são suficientes. Cada worker carrega os modelos
em memória independentemente (~800MB por worker = ~1.6GB total).

---

## 6. Engine de reconhecimento facial

### Modelos utilizados

**SCRFD (parte do buffalo_s InsightFace)**
Detector de faces rápido e preciso. Detecta faces em imagens de
até 640px, retorna bounding box e 5 keypoints para alinhamento.
Descarta detecções com score abaixo de 0.75.
Latência: ~30ms por frame.

**ArcFace R50 (parte do buffalo_s InsightFace)**
Extrator de embeddings de 512 dimensões. Embeddings são
normalizados L2 automaticamente pelo modelo (||e|| = 1).
Treinado em datasets de dezenas de milhões de faces.
Latência: ~80ms por frame.

**MiniFASNet v1 + v2 (Silent-Face-Anti-Spoofing)**
Dois modelos de liveness detection com escalas diferentes.
Ver seção 7 para detalhes completos.

### Serialização de embeddings

O embedding é um `np.ndarray` de shape `(512,)` dtype `float32`.

Serialização: `embedding.astype(np.float32).tobytes()` → 2048 bytes.
Deserialização: `np.frombuffer(plaintext, dtype=np.float32).copy()`.

Não usar base64 — a conversão bytes→base64→bytes é desnecessária
e adiciona ~33% de tamanho sem benefício.

### Criptografia: Envelope Encryption por tenant

O sistema usa **envelope encryption** (padrão DEK/KEK):

```
MASTER_KEY (KEK)
  └─ 32 bytes, hex 64 chars, carregada do env em ambos os serviços
  └─ Usada exclusivamente para cifrar/decifrar DEKs

DEK (Data Encryption Key) — uma por tenant
  └─ 32 bytes gerados com os.urandom(32) na criação do tenant
  └─ Armazenada criptografada na tabela tenant_keys (jamais em plaintext)
  └─ Usada para cifrar/decifrar os embeddings do tenant
```

**Criptografia de cada embedding (AES-256-GCM com DEK do tenant):**

```
IV: 12 bytes gerados com os.urandom(12) por operação — nunca reutilizar
Plaintext: 2048 bytes do embedding serializado
Output AESGCM.encrypt: ciphertext + tag (tag = últimos 16 bytes)

Armazenamento em facial_embeddings:
  embedding_iv   BYTEA  — 12 bytes
  embedding_tag  BYTEA  — 16 bytes
  embedding_ct   BYTEA  — 2048 bytes
  key_version    INT    — versão da DEK usada (suporte a rotação)
```

**Fluxo de uso da DEK:**

```
1. Criação do tenant (Node):
   gera DEK = os.urandom(32)
   iv  = os.urandom(12)
   (dek_ct, dek_tag) = AESGCM(MASTER_KEY).encrypt(iv, DEK)
   INSERT tenant_keys (dek_ct, dek_iv=iv, dek_tag, key_version=1)
   DEK descartada da memória

2. Cadastro de embedding (Node → Engine):
   Node busca (dek_ct, dek_iv, dek_tag) em tenant_keys
   Envia para engine junto com a imagem
   Engine: DEK = AESGCM(MASTER_KEY).decrypt(dek_iv, dek_ct+dek_tag)
           criptografa embedding com DEK
           retorna (embedding_iv, embedding_tag, embedding_ct, key_version)

3. Reconhecimento / warm cache (Node → Engine):
   Node busca DEK encriptada e embeddings do tenant
   Envia (dek_ct, dek_iv, dek_tag) + candidatos para engine
   Engine: decifra DEK com MASTER_KEY → cache DEK por tenant_id (TTL 1h)
           decifra embeddings dos candidatos com DEK
           compara e retorna resultado
```

**Cache da DEK na face engine:**

A DEK de cada tenant é mantida em memória no worker após a primeira
decifragem (dict Python `{tenant_id: (dek_bytes, expires_at)}`).
O Node invalida o cache via `DELETE /cache/dek/{tenant_id}` ao
rotacionar a chave. TTL máximo: 1h mesmo sem invalidação ativa.

**Isolamento por tenant:**
Compromisso de uma DEK não exposta outras tenants nem a MASTER_KEY.
Rotação de MASTER_KEY exige apenas re-cifrar as DEKs (não todos os
embeddings). Rotação de DEK de um tenant exige re-cifrar apenas
os embeddings daquele tenant.

A tag GCM garante integridade — adulteração no banco lança `InvalidTag`.
Nunca capturar esse erro silenciosamente.

### Comparação vetorizada

Como embeddings ArcFace são normalizados L2:

```python
# candidate_matrix: shape (N, 512)
# query_embedding: shape (512,)
similarities = candidate_matrix @ query_embedding     # (N,)
distances = np.sqrt(2 * (1 - np.clip(similarities, -1, 1)))  # (N,)
best_idx = np.argmin(distances)
```

Para N=300 candidatos, a operação completa leva < 1ms em NumPy.
Threshold padrão: 1.10 (configurável por tenant em tenant_settings).

Conversão para confidence score (0.0 a 1.0):

```python
confidence = max(0.0, 1.0 - (best_distance / 1.5))
```

### Pipeline completo (ordem com early exit)

```
1. Decodificar JPEG/PNG via OpenCV
   → HTTP 400 se inválido
   Imagem esperada: 320×320 JPEG (pré-recortada pelo browser)

2. Sem redimensionamento necessidade para SCRFD
   → crop 320×320 já está dentro do limite interno do SCRFD
   → redimensionamento ocorre apenas se imagem > 640px (fallback)

3. SCRFD detecta faces
   → retorna no_face_detected se ausente
   → seleciona face com maior bounding box (mais próxima)
   → descarta se det_score < 0.75

4. MiniFASNet v1+v2 (liveness)
   → retorna liveness_failed se score < threshold
   → inclui liveness_score no response sempre

5. Análise HSV de saturação (detecção de tela)
   → não bloqueia sozinha
   → penaliza se saturação alta + liveness_score próximo do limite

6. ArcFace R50 extrai embedding 512d

7. Resolve candidatos:
   a. busca no cache em memória (dict Python)
   b. para ausentes: descriptografa embeddings recebidos no request
   c. insere novos no cache

8. Comparação vetorizada NumPy

9. Se status='liveness_failed' e save_fraud_frames=true:
   Salva fraud frame em disco (fire-and-forget, não bloqueia)

10. Retorna resultado
```

### Contratos da engine

**POST /recognize**

Request:

```json
{
  "tenant_id": "string",
  "image_b64": "string (JPEG base64)",
  "tenant_dek": {
    "dek_ct": "hex",
    "dek_iv": "hex",
    "dek_tag": "hex",
    "key_version": 1
  },
  "candidates": [
    {
      "person_id": 1,
      "embedding_iv": "hex",
      "embedding_tag": "hex",
      "embedding_ct": "hex",
      "key_version": 1
    }
  ]
}
```

Response (identificado):

```json
{
  "status": "identified",
  "person_id": 1,
  "confidence": 0.87,
  "liveness_score": 0.94,
  "saturation_mean": 82.3,
  "processing_ms": 183
}
```

Response (outros casos):

```json
{
  "status": "not_identified | liveness_failed | no_face_detected",
  "best_distance": 1.23,
  "liveness_score": 0.31,
  "saturation_mean": 142.7,
  "processing_ms": 95
}
```

**POST /embeddings/register**

Recebe imagem multipart, detecta face, extrai embedding,
criptografa e retorna para o Node persistir no PostgreSQL.
A engine não persiste nada.

Response:

```json
{
  "person_id": 1,
  "embedding_iv": "hex",
  "embedding_tag": "hex",
  "embedding_ct": "hex",
  "key_version": 1,
  "model_version": "arcface_r50_v1"
}
```

**DELETE /embeddings/{tenant_id}/{person_id}**

Invalida entrada no cache em memória.
Chamado pelo Node quando usuário é removido ou embedding atualizado.

**POST /cache/warm**

Recebe lista de candidatos com embeddings criptografados,
descriptografa e popula cache. Chamado pelo Node ao abrir a
chamada, antes do primeiro reconhecimento.

**GET /health**

```json
{
  "status": "ok",
  "models": {
    "detector": true,
    "embedder": true,
    "liveness_v1": true,
    "liveness_v2": true
  }
}
```

---

## 7. Anti-spoofing

O sistema usa quatro camadas complementares. Nenhuma camada
isolada é infalível — a combinação cobre os ataques casuais
que representam 99% dos casos reais em ambiente escolar.

### Camada 1 — Variação de pixels (frontend, ~5ms)

**O que detecta:** imagens estáticas — fotos impressas e telas
que não variam entre frames.

**Como funciona:** o frontend exibe uma máscara oval centralizada
sobre o feed da câmera, guiando o posicionamento do rosto. O crop
usado em todo o pipeline é o bounding box da oval acrescido de 25%
de padding em cada direção — nunca o frame completo. Isso reduz a
área processada pelo SCRFD em ~4×.

O frontend captura 3 crops com 250ms de intervalo (total 500ms),
sem nenhum roundtrip de rede. Compara a diferença absoluta média de
pixels entre o crop 1 e o crop 3 numa versão reduzida a 160×120
pixels em escala de cinza. Se a diferença for menor que o threshold
(3.0), descarta silenciosamente e continua o loop. Se passar, envia
o crop central redimensionado para **320×320px** à engine como JPEG
com qualidade 80.

**Threshold:** 3.0 (diferença média por pixel em escala 0–255).
Calibrar empiricamente no ambiente real. Típico:

- foto impressa: 0.1–0.5
- tela estática: 0.5–1.5
- pessoa real: 3.0–15.0

**Parâmetros do crop:**

- Máscara: oval centrada, altura ≈ 60% da viewport
- Padding: 25% do raio da oval em cada direção
- Resolução de envio: 320×320px (Canvas API → `toBlob('image/jpeg', 0.8)`)
- Face Detection API (Chrome/Edge): usada para feedback dinâmico de
  distância (oval muda de cor quando o rosto está no tamanho correto);
  não bloqueia o pipeline se indisponível

**Limitação:** vídeo em loop passa por essa camada.

### Camada 2 — MiniFASNet v1+v2 (engine, ~40ms)

**O que detecta:** fotos impressas, fotos em tela de celular,
máscaras 2D e ataques de replay básicos.

**Como funciona:** dois modelos ONNX treinados especificamente
para anti-spoofing, em escalas diferentes da região da face.

- v1 (escala 2.7x): analisa textura em área menor, captura
  padrões de poros e reflexos de pele
- v2 (escala 4.0x): analisa textura em área maior ao redor
  da face, captura padrões que fotos não reproduzem

Crop para cada modelo:

```
cx, cy = centro do bounding box
w = largura_bbox * escala
h = altura_bbox * escala
crop = frame[cy-h/2:cy+h/2, cx-w/2:cx+w/2]
crop = resize(crop, 80x80)
```

Score final: `v1 * 0.4 + v2 * 0.6`
Threshold padrão: 0.85 (configurável por tenant).

**Pesos ONNX:** baixar de `minivision-lab/Silent-Face-Anti-Spoofing`
no GitHub. Arquivos: `2.7_80x80_MiniFASNetV1.onnx` e
`4_0_80x80_MiniFASNetV2.onnx`.

**Limitação:** foto de alta qualidade em papel fotográfico
com iluminação controlada pode passar. Raro em ambiente real.

### Camada 3 — Análise de saturação HSV (engine, ~5ms)

**O que detecta:** telas de dispositivos com saturação de cor
artificialmente alta.

**Como funciona:** converte crop da face para HSV, analisa o
canal de saturação S. Telas tendem a ter saturação média alta
(>140) com desvio padrão baixo (<45). Pele real tem distribuição
de saturação mais variada.

Não bloqueia sozinha — penaliza o resultado final se:
`saturation_mean > 140 AND saturation_std < 45 AND liveness_score < threshold * 1.2`

**Limitação:** telas de alta qualidade com modo noturno ativado
podem não ser detectadas. Câmeras com saturação aumentada
podem gerar falsos positivos.

### Camada 4 — Fraud frame (deterrência, ~0ms no caminho crítico)

**O que faz:** quando `status = 'liveness_failed'` e `tenant.save_fraud_frames = true`,
salva o frame capturado em disco. O gestor pode auditar visualmente
as tentativas de fraude detectadas.

**Por que funciona:** a maioria das fraudes são oportunistas.
Saber que existe um registro fotográfico de tentativas bloqueadas
inibe novas tentativas. Salvar apenas frames de falha de liveness
reduz o armazenamento a uma fração do volume total.

**Implementação:** fire-and-forget com `asyncio.create_task`.
Não bloqueia o pipeline de reconhecimento. Se falhar o salvamento,
loga o erro mas não falha o reconhecimento.

Ver seção 8 para detalhes completos do sistema de auditoria.

### Fluxo encadeado das camadas

```
Frontend (browser — Canvas API):
  Exibe máscara oval sobre o feed da câmera
  Crop do bounding box da oval + 25% padding
  Captura crop 1 → aguarda 250ms
  Captura crop 2 → aguarda 250ms
  Captura crop 3
    │
    ▼
  [Camada 1] Variação de pixels sobre crop 160×120 (5ms)
    ├── < 3.0 → descarta silencioso → reinicia loop
    └── ≥ 3.0 → redimensiona crop 2 para 320×320
                 → serializa JPEG 80%
                 → envia para engine

Engine Python (recebe 320×320 JPEG):
    │
    ▼
  SCRFD detecta face (área já pré-recortada — ~4× mais rápido)
    ├── sem face → no_face_detected
    └── face detectada
          │
          ▼
        [Camada 2] MiniFASNet v1+v2 (40ms)
          ├── score < 0.85 → liveness_failed
          └── score ≥ 0.85
                │
                ▼
              [Camada 3] Análise HSV (5ms)
                │ (não bloqueia — contribui para penalização)
                │
                ▼
              ArcFace embedding → comparação
                │
                ▼
              [Camada 4] Se liveness_failed e save_fraud_frames=true:
                          salva fraud frame (async)
                │
                ▼
              Retorna resultado
```

**Latência total para reconhecimento legítimo:**
~500ms captura + ~150ms engine (crop 320×320) = ~650ms ponta a ponta.

---

## 8. Fraud Frames e LGPD

### O que é armazenado

Para cada tentativa de reconhecimento, o sistema salva sempre
um registro de log no banco. Imagens em disco são **opcionais
e restritas a tentativas de fraude**:

**No PostgreSQL (permanente):**

- `recognition_logs`: status, person_id, confidence, liveness_score,
  saturation_mean, processing_ms, device_id, tenant_id, timestamp
- `fraud_frame_path` (nullable) — preenchido apenas quando
  `status = 'liveness_failed'` e `tenant.save_fraud_frames = true`
- `fraud_frame_exists` — false após exclusão pelo job de limpeza

**No filesystem (temporário — configurável por tenant):**

- Frame JPEG apenas de tentativas bloqueadas por liveness
- Organizado em `./fraud_frames/{tenant_id}/{YYYY-MM-DD}/`
- Nome: `{timestamp_ms}_failed_{recognition_log_id}.jpg`
- Qualidade JPEG 70
- Habilitado por tenant: `save_fraud_frames = true` (padrão)

Reconhecimentos bem-sucedidos (`identified`) e falhas sem fraude
(`not_identified`, `no_face_detected`) **não geram arquivo em disco**.

### Por que somente frames de fraude

Salvar frames de todos os registros cria volume desnecessário e
aumento do risco de exposição de dados biométricos sem finalidade
clara. Frames de `liveness_failed` têm finalidade específica e
defensável: evidenciar a tentativa de fraude para o gestor.

O prazo padrão de 24 horas cobre o ciclo completo do dia letivo.
Configurável por tenant em `fraud_retention_hours`.

### Job de limpeza automática

Roda todos os dias às 03:00 (horário do servidor, configurável).
Deleta todos os arquivos em `./fraud_frames/` expirados conforme
o `fraud_retention_hours` de cada tenant.
Atualiza `fraud_frame_exists = false` e `fraud_frame_path = NULL`
nos `recognition_logs` correspondentes.

A exclusão é **comprovável** — o job gera um log de quantos arquivos
foram deletados por tenant, registrado em `audit_cleanup_logs`.

### Base legal LGPD

**Base legal principal:** legítimo interesse do controlador
(instituição de ensino / tenant), combinado com o interesse
legítimo de proteção da integridade dos registros acadêmicos.

**Finalidade:** exclusivamente auditoria de fraude de chamada para
o dia corrente. Não inclui treinamento de modelos, análise
comportamental, ou qualquer finalidade secundária.

**Necessidade:** dados mínimos (um frame por registro, qualidade
reduzida para 70% JPEG, descarte automático em 24h).

**Transparência:** obrigatório constar na política de privacidade
do tenant que imagens faciais são capturadas na chamada,
retidas por até 24 horas para fins de auditoria de fraude, e
descartadas automaticamente.

**Acesso restrito:** apenas usuários com role `admin` ou `manager`
do tenant podem visualizar os fraud frames. O operador do SaaS
não acessa imagens de tenants. Isso deve estar explícito
no contrato com o tenant e na política de privacidade.

### O que você (operador) não pode fazer com as imagens

- Usar para treinar ou melhorar modelos de reconhecimento facial
- Compartilhar com terceiros além do tenant contratante
- Manter além do prazo configurado em `fraud_retention_hours`
- Usar para qualquer finalidade além de evidenciar fraudes de liveness

### Implementação técnica da restrição de acesso

O endpoint de visualização de fraud frames verifica:

1. JWT válido
2. `role IN ('admin', 'manager')`
3. `tenant_id` do JWT bate com o `tenant_id` do frame solicitado

Qualquer divergência retorna HTTP 403. O path do arquivo nunca
é exposto diretamente — o Node serve o arquivo via stream
após validar as três condições acima.

---

## 9. Estrutura de dados completa

### Schema PostgreSQL

Todas as tabelas incluem `created_at TIMESTAMPTZ DEFAULT NOW()`
e `updated_at TIMESTAMPTZ DEFAULT NOW()` salvo indicação contrária.

---

#### Domínio: planos e tenants

```sql
CREATE TABLE plans (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  max_classes     INT NOT NULL DEFAULT 20,       -- turmas ativas simultâneas
  price_monthly   NUMERIC(10,2) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenants (
  id                    SERIAL PRIMARY KEY,
  plan_id               INT NOT NULL REFERENCES plans(id),
  name                  VARCHAR(200) NOT NULL,
  document              VARCHAR(20),             -- CNPJ ou CPF
  institution_type      VARCHAR(20) NOT NULL
                        CHECK (institution_type IN ('school','university')),
  -- institution_type é apenas classificação cadastral; os modos de operação
  -- (pré-presença, checkout individual) são controlados em tenant_settings
  status                VARCHAR(20) NOT NULL DEFAULT 'trial'
                        CHECK (status IN ('active','suspended','trial','cancelled')),
  trial_ends_at         TIMESTAMPTZ,
  timezone              VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_settings (
  tenant_id                     INT PRIMARY KEY REFERENCES tenants(id),
  recognition_threshold         FLOAT NOT NULL DEFAULT 1.10,
  liveness_threshold            FLOAT NOT NULL DEFAULT 0.85,
  liveness_enabled              BOOLEAN NOT NULL DEFAULT true,
  static_pixel_threshold        FLOAT NOT NULL DEFAULT 3.0,
  allow_manual_override         BOOLEAN NOT NULL DEFAULT true,
  -- Pré-presença: habilitável em qualquer tipo de instituição
  pre_attendance_enabled        BOOLEAN NOT NULL DEFAULT false,
  pre_attendance_window_min     INT NOT NULL DEFAULT 30,
  -- Checkout individual: habilitável em qualquer tipo de instituição
  individual_checkout_enabled   BOOLEAN NOT NULL DEFAULT false,
  -- Fraud frames: salvo apenas quando status='liveness_failed'
  save_fraud_frames             BOOLEAN NOT NULL DEFAULT true,
  fraud_retention_hours         INT NOT NULL DEFAULT 24,
  -- Cadastro via QR Code
  enrollment_token_expiry_hours INT NOT NULL DEFAULT 72,     -- validade do QR Code
  require_consent_before_facial BOOLEAN NOT NULL DEFAULT true, -- bloqueia facial sem aceite LGPD
  enrollment_multi_frame_count  INT NOT NULL DEFAULT 3,       -- frames capturados no cadastro
  liveness_threshold_enrollment FLOAT NOT NULL DEFAULT 0.90,  -- threshold mais rigoroso no cadastro
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### Domínio: usuários e autenticação

```sql
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(200),
  password_hash   VARCHAR(255),          -- NULL para alunos sem acesso ao painel
  role            VARCHAR(20) NOT NULL
                  CHECK (role IN (
                    'super_admin','admin','manager','teacher','student'
                  )),
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','pending')),
  document        VARCHAR(20),           -- CPF
  enrollment_code VARCHAR(50),           -- matrícula institucional (opcional)
  -- Estado do cadastro biométrico (desnormalizado para queries rápidas)
  facial_status   VARCHAR(20) NOT NULL DEFAULT 'none'
                  CHECK (facial_status IN (
                    'none',             -- sem QR Code gerado
                    'consent_given',    -- aceitou regulamento, cadastro facial pendente
                    'registered',       -- embedding facial salvo e ativo
                    'consent_refused',  -- recusou o regulamento no totem
                    'revoked'           -- consentimento revogado posteriormente
                  )),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- Uma DEK por tenant, cifrada com MASTER_KEY
CREATE TABLE tenant_keys (
  tenant_id    INT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  dek_ct       BYTEA NOT NULL,           -- DEK cifrada com MASTER_KEY
  dek_iv       BYTEA NOT NULL,           -- 12 bytes
  dek_tag      BYTEA NOT NULL,           -- 16 bytes (tag GCM)
  key_version  INT NOT NULL DEFAULT 1,   -- incrementado a cada rotação
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE facial_embeddings (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding_iv    BYTEA NOT NULL,        -- 12 bytes
  embedding_tag   BYTEA NOT NULL,        -- 16 bytes
  embedding_ct    BYTEA NOT NULL,        -- 2048 bytes (512 float32)
  key_version     INT NOT NULL DEFAULT 1,-- versão da DEK usada na cifração
  model_version   VARCHAR(50) NOT NULL DEFAULT 'arcface_r50_v1',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, model_version)
);

-- Tokens de QR Code para cadastro biométrico dos alunos (uso único)
CREATE TABLE enrollment_tokens (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- token_hash = SHA-256(token_bruto_hex) — nunca armazenar o token em plaintext
  token_hash      VARCHAR(255) NOT NULL UNIQUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','used','expired','revoked')),
  expires_at      TIMESTAMPTZ NOT NULL,   -- NOW() + enrollment_token_expiry_hours
  used_at         TIMESTAMPTZ,            -- quando foi consumido
  used_by_device  VARCHAR(255),           -- fingerprint do totem que consumiu
  created_by_id   INT NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Consentimentos formais de uso de dados biométricos (LGPD)
-- Deve existir um registro ativo antes de qualquer embedding ser salvo
CREATE TABLE biometric_consents (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_id             INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_text_version  VARCHAR(20) NOT NULL, -- ex: 'v1.0' (versão do texto exibido)
  consented_at          TIMESTAMPTZ NOT NULL,
  device_fingerprint    VARCHAR(255) NOT NULL, -- totem onde ocorreu
  ip_address            VARCHAR(45) NOT NULL,  -- IPv4 ou IPv6
  is_active             BOOLEAN NOT NULL DEFAULT true,
  revoked_at            TIMESTAMPTZ,
  revoked_by_id         INT REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE devices (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL REFERENCES tenants(id),
  device_fingerprint  VARCHAR(255) NOT NULL,
  label               VARCHAR(100),              -- "Sala 12 — Bloco B"
  api_key_hash        VARCHAR(255) NOT NULL,
  location_id         INT REFERENCES locations(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, device_fingerprint)
);
```

---

#### Domínio: localização

```sql
CREATE TABLE locations (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,   -- "Bloco A", "Campus Centro"
  address         VARCHAR(300),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### Domínio: estrutura acadêmica

```sql
CREATE TABLE academic_periods (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,   -- "2026/1"
  starts_at       DATE NOT NULL,
  ends_at         DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE courses (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL REFERENCES tenants(id),
  academic_period_id  INT NOT NULL REFERENCES academic_periods(id),
  name                VARCHAR(200) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE classes (
  id                    SERIAL PRIMARY KEY,
  tenant_id             INT NOT NULL REFERENCES tenants(id),
  course_id             INT NOT NULL REFERENCES courses(id),
  name                  VARCHAR(100) NOT NULL,    -- "Turma A — Noturno"
  teacher_id            INT NOT NULL REFERENCES users(id),
  room                  VARCHAR(50),
  location_id           INT REFERENCES locations(id),
  -- Total de aulas previstas para o período (definido pelo professor/admin)
  -- Definido pelo coordenador/admin, não pelo professor
  total_classes_planned INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE class_enrollments (
  class_id        INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, user_id)
);

-- Acumula quantas aulas cada aluno frequentou por turma no período
CREATE TABLE student_class_summary (
  class_id            INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classes_attended    INT NOT NULL DEFAULT 0,
  classes_absent      INT NOT NULL DEFAULT 0,
  last_updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, user_id)
);

CREATE TABLE class_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL REFERENCES tenants(id),
  class_id            INT NOT NULL REFERENCES classes(id),
  teacher_id          INT NOT NULL REFERENCES users(id),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  status              VARCHAR(20) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed')),
  -- Informado pelo professor ao abrir a sessão (ex: aula dupla = 2)
  classes_worth       INT NOT NULL DEFAULT 1,
  created_by          INT NOT NULL REFERENCES users(id)
);

CREATE TABLE attendance_records (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_id             INT NOT NULL,
  class_session_id      BIGINT NOT NULL REFERENCES class_sessions(id),
  user_id               INT NOT NULL REFERENCES users(id),
  status                VARCHAR(20) NOT NULL
                        CHECK (status IN (
                          'present','absent','manual','early_checkout'
                        )),
  -- 'early_checkout': presente mas saiu antes do encerramento (modo faculdade)
  recognized_at         TIMESTAMPTZ,         -- horário de entrada reconhecida
  checked_out_at        TIMESTAMPTZ,         -- horário de saída (checkout individual)
  checkout_released_by  INT REFERENCES users(id), -- professor que liberou saída
  confidence            FLOAT,
  liveness_score        FLOAT,
  was_pre_attendance    BOOLEAN NOT NULL DEFAULT false,
  adjusted_by           INT REFERENCES users(id),
  adjusted_at           TIMESTAMPTZ,
  UNIQUE (class_session_id, user_id)
);

-- Pré-presenças: usada somente quando pre_attendance_enabled = true no tenant_settings
CREATE TABLE pre_attendances (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL,
  location_id     INT NOT NULL REFERENCES locations(id),
  user_id         INT NOT NULL REFERENCES users(id),
  recognized_at   TIMESTAMPTZ NOT NULL,
  confidence      FLOAT NOT NULL,
  liveness_score  FLOAT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  consolidated    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- impede duplicata: só a primeira chegada por local por dia conta
  UNIQUE (tenant_id, location_id, user_id, date(recognized_at))
);
```

---

#### Domínio: reconhecimento e auditoria

```sql
CREATE TABLE recognition_logs (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           INT NOT NULL,
  device_id           INT REFERENCES devices(id),
  user_id             INT REFERENCES users(id),  -- NULL se não identificado
  status              VARCHAR(30) NOT NULL
                      CHECK (status IN (
                        'identified','not_identified',
                        'liveness_failed','no_face_detected'
                      )),
  confidence          FLOAT,
  liveness_score      FLOAT,
  saturation_mean     FLOAT,
  processing_ms       INT,
  -- Preenchido apenas quando status='liveness_failed' e tenant.save_fraud_frames=true
  -- NULL se não salvo ou após exclusão pelo job de limpeza
  fraud_frame_path    VARCHAR(500),
  fraud_frame_exists  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_cleanup_logs (
  id                  SERIAL PRIMARY KEY,
  run_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  files_deleted       INT NOT NULL DEFAULT 0,
  bytes_freed         BIGINT NOT NULL DEFAULT 0,
  tenants_processed   INT NOT NULL DEFAULT 0,
  error_message       TEXT        -- NULL se sucesso
);
```

---

#### Índices críticos

```sql
-- Lookup por API Key (hot path de toda requisição de dispositivo)
CREATE INDEX ON devices (api_key_hash);
CREATE INDEX ON devices (tenant_id, is_active);

-- Queries de presença
CREATE INDEX ON users (tenant_id, status);
CREATE INDEX ON users (tenant_id, facial_status);
CREATE INDEX ON facial_embeddings (tenant_id, user_id);
CREATE INDEX ON class_sessions (tenant_id, status, started_at DESC);
CREATE INDEX ON attendance_records (tenant_id, class_session_id);
CREATE INDEX ON attendance_records (class_session_id, status);
CREATE INDEX ON pre_attendances (tenant_id, location_id, consolidated)
  WHERE consolidated = false;
CREATE INDEX ON student_class_summary (class_id, user_id);

-- Cadastro QR Code (hot path de validação de token)
CREATE UNIQUE INDEX ON enrollment_tokens (token_hash);
CREATE INDEX ON enrollment_tokens (tenant_id, user_id);
CREATE INDEX ON enrollment_tokens (tenant_id, status);

-- Consentimentos biométricos
CREATE INDEX ON biometric_consents (tenant_id, user_id);
CREATE INDEX ON biometric_consents (tenant_id, is_active) WHERE is_active = true;

-- Auditoria
CREATE INDEX ON recognition_logs (tenant_id, created_at DESC);
CREATE INDEX ON recognition_logs (tenant_id, fraud_frame_exists)
  WHERE fraud_frame_exists = true;
```

---

## 10. Multi-tenancy

### Estratégia no MVP

Isolamento por `tenant_id` em todas as tabelas. Sem schema
separado por tenant — isso simplifica queries e migrações no MVP.
Cada query obrigatoriamente inclui `WHERE tenant_id = $1`, injetado
pelo Node a partir do JWT.

O JWT do usuário contém:

```json
{
  "sub": "user_id",
  "tenant_id": "123",
  "role": "teacher",
  "exp": 1713480000
}
```

A API Key de dispositivos tem o `tenant_id` encoded no payload
(não apenas no hash) para que o middleware extraia sem consulta
adicional ao banco na maioria das rotas.

### Middleware de tenant isolation

Todo request autenticado passa por um middleware que:

1. Extrai `tenant_id` do JWT ou da API Key
2. Injeta em `req.tenantId` e `req.userId`
3. Verifica se o tenant está `active` (cache Redis de 60s)
4. Bloqueia se `suspended` ou `cancelled`

Nenhum controller acessa dados de outro tenant — a validação
é feita no middleware, não espalhada pelo código.

### Roadmap para isolamento completo

Pós-MVP: migrar para schemas PostgreSQL separados por tenant.
Cada tenant terá seu próprio schema com as mesmas tabelas.
Isso provê isolamento de performance (índices menores) e
facilita exportação/exclusão completa de dados de um tenant
(LGPD — direito ao esquecimento).

---

## 11. Fluxos principais

### 11.1 Cadastro de aluno com QR Code (enrollment flow)

```
[Etapa 1 — Admin no painel]

Admin acessa painel → cadastra dados básicos do aluno
(nome, matrícula, e-mail, CPF, etc.) → facial_status = 'none'
    │
    ▼
POST /api/students/:id/enrollment-token
Node: gera token bruto = crypto.randomBytes(32) → hex string (64 chars)
      token_hash = SHA-256(token_bruto)
      INSERT enrollment_tokens (token_hash, status='pending',
        expires_at = NOW() + enrollment_token_expiry_hours)
      Retorna QR Code como SVG/PNG contendo a URL:
        https://seudominio.com/totem/enroll?token={token_bruto}
Admin imprime/envia ao aluno

[Etapa 2 — Aluno no totem]

Aluno aperta botão "Cadastrar" no totem (ou scanneia QR Code)
O totem entra em registration_mode
    │
    ▼
POST /api/enrollment/validate-token  (autenticado por X-Device-Key)
  body: { token: "{token_bruto}" }
Node: token_hash = SHA-256(token)
      SELECT * FROM enrollment_tokens WHERE token_hash = ? AND status = 'pending'
      Se expirado → retorna 410 GONE { error: 'token expirado', code: 'token_expired' }
      Se usado/revogado → retorna 409 CONFLICT
      Se não encontrado → retorna 404
      UPDATE enrollment_tokens SET status = 'used', used_at = NOW(),
        used_by_device = device_fingerprint
        WHERE token_hash = ? AND status = 'pending' -- transação atômica
      Cria sessão de cadastro no Redis:
        enrollment_session:{session_id} = {
          userId, tenantId, deviceFingerprint,
          consentGiven: false, framesCaptures: 0,
          embeddings: [], createdAt
        }
        TTL: 10 minutos
      Retorna { sessionId, studentName, studentEnrollmentCode }
Totem exibe: "Cadastrando: [NOME DO ALUNO]"
    │
    ▼
Totem exibe regulamento LGPD (versão configurada por tenant/global)
Aluno lê e toca "Aceitar" ou "Recusar"
    │
    ├── [RECUSOU]
    │   POST /api/enrollment/refuse
    │   Node: UPDATE users SET facial_status = 'consent_refused'
    │         DEL enrollment_session:{session_id} do Redis
    │   Totem exibe mensagem informativa → volta ao modo normal
    │
    └── [ACEITOU]
        POST /api/enrollment/consent
          body: { sessionId, consentTextVersion }
        Node: INSERT biometric_consents (tenant_id, user_id,
                consent_text_version, consented_at, device_fingerprint, ip_address)
              UPDATE users SET facial_status = 'consent_given'
              Atualiza sessão Redis: consentGiven = true
              Retorna { ok: true }
            │
            ▼
        Totem exibe instrução: "Olhe para a câmera"
        Loop de captura multi-frame (enrollment_multi_frame_count frames):
          Para cada frame:
            1. Variação de pixels (mesma Camada 1 do reconhecimento)
            2. POST /api/enrollment/frame  (autenticado por X-Device-Key + sessionId)
               body: { sessionId, frameB64 }
               Node → Engine POST /enroll/frame
               Engine: SCRFD detecta face (det_score ≥ 0.85)
                       MiniFASNet liveness (threshold = liveness_threshold_enrollment)
                       ArcFace extrai embedding 512d
                       Retorna { embedding_iv, embedding_tag, embedding_ct, liveness_score }
               Se liveness falhar → Node responde { ok: false, reason: 'liveness_failed' }
                 Totem exibe alerta → reinicia captura deste frame (não avança)
               Se ok → Node armazena embedding na sessão Redis (framesCaptures++)
          Quando framesCaptures == enrollment_multi_frame_count:
            POST /api/enrollment/finalize  { sessionId }
            Node → Engine POST /enroll/finalize
              body: { embeddings: [...] }  -- lista dos N embeddings em ciphertext
            Engine: decifra todos com DEK do tenant
                    calcula média vetorial → normaliza L2
                    re-criptografa embedding consolidado com DEK
                    retorna embedding final criptografado
            Node: INSERT facial_embeddings (embedding_iv, embedding_tag, embedding_ct)
                  UPDATE users SET facial_status = 'registered'
                  DEL enrollment_session:{session_id}
                  DELETE /embeddings/{tenantId}/{userId} na engine (invalida cache)
        Totem exibe confirmação: "[NOME] cadastrado com sucesso!" → modo normal
```

### 11.2 Regeneração de QR Code

```
Admin acessa painel → seleciona aluno → clica "Reenviar QR Code"
    │
    ▼
POST /api/students/:id/enrollment-token  (mesma rota, idempotente)
Node: UPDATE enrollment_tokens SET status = 'revoked'
      WHERE user_id = ? AND status = 'pending'   -- revoga tokens anteriores
      Gera novo token bruto e novo token_hash
      INSERT enrollment_tokens (novo token)
      Retorna novo QR Code
Admin imprime/reenvia ao aluno
```

### 11.3 Cadastro de aluno com embedding facial (admin direto — legado)

```
Admin acessa painel → cadastra dados do aluno
    │
    ▼
Admin faz upload de foto ou captura via totem/webcam
    │
    ▼
Node busca DEK cifrada do tenant em tenant_keys
    │
    ▼
Node envia imagem + DEK cifrada para POST /embeddings/register na engine
    │
    ▼
Engine: decifra DEK com MASTER_KEY (em memória, jamais persistida)
→ SCRFD detecta face → ArcFace extrai embedding 512d
→ AES-256-GCM criptografa com DEK do tenant
→ retorna (iv, tag, ct, key_version) em hex
    │
    ▼
Node salva em facial_embeddings no PostgreSQL (incluindo key_version)
    │
    ▼
Node invalida cache da engine: DELETE /embeddings/{tenant}/{user}
    │
    ▼
Confirmação ao admin
```

### 11.4 Abertura de chamada e warm cache

```
Professor clica "Abrir Chamada" no painel
→ Informa quantas aulas a sessão representa (classes_worth, padrão: 1)
    │
    ▼
Node cria class_session no PostgreSQL (status: 'open')
    │
    ▼
Node busca alunos da turma (class_enrollments JOIN facial_embeddings)
    │
    ▼
Node busca DEK cifrada do tenant em tenant_keys
Node envia POST /cache/warm com DEK cifrada + candidatos + embeddings
Engine: decifra DEK com MASTER_KEY → cacheia DEK por tenant_id (TTL 1h)
→ decifra embeddings → popula cache em memória
    │
    ▼
[Modo Escola — se pre_attendance_enabled = true]:
Node busca pré-presenças no Redis:
  SCAN prepresenca:{tenant_id}:{location_id}:*

Para cada pré-presença:
  valida se user está na turma
  valida se timestamp está dentro da janela (pre_attendance_window_min)
  se válida: INSERT attendance_records (was_pre_attendance: true, status: 'present')
  DEL chave do Redis
    │
    ▼
Emite SSE para o totem: chamada aberta, lista de candidatos atualizada
```

### 11.5 Reconhecimento no totem — loop completo

```
Totem (browser/PWA):
  Captura frame 1 → aguarda 250ms
  Captura frame 2 → aguarda 250ms
  Captura frame 3
    │
    ▼
  JS calcula variação de pixels (160×120 grayscale)
    ├── < 3.0 → descarta → aguarda 500ms → reinicia
    └── ≥ 3.0 → envia frame 2 via POST /device/recognize
                header: X-Device-Key: {api_key}

Node:
  Valida API Key → extrai tenant_id e device_id
  Identifica location_id do dispositivo
  Busca candidate_ids (alunos da turma ativa no totem)
  Busca embeddings de facial_embeddings WHERE user_id = ANY(candidate_ids)
  Busca DEK cifrada do tenant em tenant_keys
  Chama engine POST /recognize com DEK cifrada + candidatos

Engine:
  SCRFD → liveness MiniFASNet → HSV → ArcFace → compara cache
  Se liveness_failed e save_fraud_frames=true: salva fraud frame (async)
  Retorna resultado

Node:
  Se identified:
    Verifica se já existe registro para esse user nessa session
    Se não: INSERT attendance_record (status: 'present', recognized_at: now())
    Emite SSE para painel: {user_id, name, confidence, timestamp}
  Se liveness_failed:
    Salva recognition_log com status liveness_failed
    Não emite SSE visível (opcional: alerta discreto para professor)
  Se not_identified:
    Salva recognition_log
    Sem ação

Totem:
  Se identified: exibe nome + foto por 3s → cooldown 4s → reinicia
  Se outros: reinicia imediatamente
```

### 11.6 Pré-presença (Modo Escola)

```
Reconhecimento bem-sucedido mas sem class_session ativa
(apenas se tenant.pre_attendance_enabled = true):

Node verifica: nenhuma sessão ativa no location_id do totem
→ SET NX em Redis: prepresenca:{tenant}:{location}:{user_id} = timestamp
→ TTL: pre_attendance_window_min * 60 segundos
→ Se já existe: ignora (preserva timestamp mais antigo)
→ Se não existia: INSERT pre_attendances no PostgreSQL
```

### 11.7 Checkout individual (`individual_checkout_enabled = true`)

```
Professor acessa lista de presença em tempo real
→ Seleciona aluno que precisa sair antes do encerramento
→ Clica "Liberar Saída"

Node:
  POST /api/attendance/records/{id}/checkout
  Valida que o usuário autenticado é teacher da turma
  UPDATE attendance_records SET
    status = 'early_checkout',
    checked_out_at = NOW(),
    checkout_released_by = teacher_id
  Emite SSE para totem: aluno marcado como saída antecipada
```

### 11.8 Encerramento de chamada e contagem de aulas

```
Professor clica "Encerrar Chamada"
    │
    ▼
Node:
  Busca todos os attendance_records da sessão
  Para cada aluno matriculado na turma:
    Se sem registro → INSERT attendance_records (status: 'absent')
    Se status IN ('present','early_checkout','manual') → contabiliza como presente
  UPDATE class_sessions SET status = 'closed', ended_at = NOW()
    │
    ▼
Node atualiza student_class_summary para cada aluno da turma:
  classes_attended += session.classes_worth  (se presente)
  classes_absent   += session.classes_worth  (se ausente)
    │
    ▼
Emite SSE para painel: chamada encerrada, lista final consolidada
```

---

## 12. Stack tecnológica

### Backend (Node.js)

```
Node.js 20 LTS
Express 4
PostgreSQL driver: node-postgres (pg) com pool
Redis client: ioredis
JWT: jsonwebtoken
Validação: zod
Senhas: bcrypt
Variáveis: dotenv
Logs: pino
```

### Frontend (Next.js)

```
Next.js 14 (App Router)
TypeScript
Tailwind CSS
ShadCN/UI para componentes do dashboard
Canvas API nativa para captura e análise de frames
EventSource (SSE) para feed em tempo real
React Hook Form + zod para formulários
```

### Engine facial (Python)

```
Python 3.11+
FastAPI + Uvicorn (workers=2)
InsightFace 0.7.3 (buffalo_s: SCRFD + ArcFace R50)
OpenCV (opencv-python-headless)
NumPy
cryptography (AESGCM)
onnxruntime (MiniFASNet)
pydantic + pydantic-settings
```

### Infraestrutura

```
PostgreSQL 16
Redis 7 Alpine (sem persistência em disco)
Nginx (reverse proxy + SSL)
Docker + Docker Compose
VPS: mínimo 4 vCPUs, 4GB RAM (2 workers Python ~1.6GB modelos)
```

---

## 13. Infraestrutura e deploy

### Docker Compose completo

```yaml
version: "3.9"

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
    depends_on:
      - nextjs
      - node-api

  nextjs:
    build: ./frontend
    environment:
      - NEXT_PUBLIC_API_URL=https://seudominio.com/api
    depends_on:
      - node-api

  node-api:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/visagex
      - REDIS_URL=redis://redis:6379
      - ENGINE_URL=http://face-engine:8001
      - ENGINE_API_KEY=${ENGINE_API_KEY}
      - MASTER_KEY=${MASTER_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
      - face-engine

  face-engine:
    build: ./face_engine
    environment:
      - MASTER_KEY=${MASTER_KEY}
      - ENGINE_API_KEY=${ENGINE_API_KEY}
      - RECOGNITION_THRESHOLD=1.10
      - LIVENESS_THRESHOLD=0.85
      - STATIC_PIXEL_THRESHOLD=3.0
      - LIVENESS_MODEL_PATH=./models
    volumes:
      - fraud_frames:/app/fraud_frames
    # workers=2: dobra throughput, cada worker ~800MB RAM de modelos
    # NÃO aumentar sem migrar cache para Redis
    command: uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=visagex
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    # Sem persistência — dados são sempre reconstituíveis
    command: redis-server --save "" --appendonly no --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
  fraud_frames:
```

### Job de limpeza de fraud frames

Cron dentro do container node-api, todo dia às 03:00:

```
0 3 * * * node /app/jobs/cleanup-fraud-frames.js
```

O job:

1. Por tenant, respeita o `fraud_retention_hours` configurado
2. Lista arquivos em `./fraud_frames/` expirados
3. Deleta os arquivos
4. Atualiza `fraud_frame_exists = false` e `fraud_frame_path = NULL`
   nos recognition_logs correspondentes
5. Insere registro em `audit_cleanup_logs`

### Variáveis de ambiente obrigatórias

```env
# PostgreSQL
POSTGRES_USER=
POSTGRES_PASSWORD=
DATABASE_URL=

# Redis
REDIS_URL=

# Engine
ENGINE_API_KEY=          # string aleatória longa
MASTER_KEY=              # 64 chars hexadecimal (256 bits) — KEK do envelope encryption
                         # usada por backend (gerar DEKs) e face-engine (decifrar DEKs)

# JWT
JWT_SECRET=              # string aleatória longa
JWT_EXPIRES_IN=15m       # access token — curta duração
JWT_REFRESH_SECRET=      # secret para refresh token (opcional, não usado no MVP atual)
JWT_REFRESH_EXPIRES_IN_SECONDS=604800  # refresh token — 7 dias em segundos

# Super Admin — Bootstrap via .env (leia seção "Super Admin" abaixo)
SUPER_ADMIN_EMAIL=       # e-mail único do super admin, ex: admin@visagex.local
SUPER_ADMIN_PASSWORD=    # senha >= 12 caracteres, gerada UMA ÚNICA VEZ no bootstrap

# Reconhecimento
RECOGNITION_THRESHOLD=1.10
LIVENESS_THRESHOLD=0.85
STATIC_PIXEL_THRESHOLD=3.0
```

---

## Super Admin — Modelo Único de Criação

### Princípio: "Uma única conta de administrador, criada via .env"

O VisageX implementa um modelo de Super Admin extremamente restritivo:

- **Existe apenas UMA conta** com role `super_admin` em todo o sistema
- **Criada durante o bootstrap** da aplicação (ao iniciar `backend/src/index.ts`)
- **Criada a partir de variáveis de ambiente** (`SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD`)
- **Nunca pode ser criada via API ou database seed**
- **Idempotente:** se já existe, o bootstrap não faz nada

### Implementação técnica

1. No boot do backend, `src/index.ts` chama `bootstrapSuperAdmin()` do `src/services/admin.service.ts`
2. A função verifica se existe um usuário com `role: "super_admin"`
   - Se **não existe:** cria um, com email e senha vindo de .env
   - Se **já existe:** log de info e retorna (sem atualizar)
3. Precisa de um tenant_id (cria-se um tenant administrativo interno: "VisageX Admin")
4. Senha é hasheada com bcrypt, nunca armazenada em plaintext

### O que NÃO é possível fazer

- ❌ Criar outro super_admin via `POST /api/users` (endpoint não permite)
- ❌ Promover usuário para super_admin via `PATCH /api/users/:id` (validação impede)
- ❌ Criar super_admin em migration ou seed SQL (função dedica recusaria)
- ❌ Alterar o super_admin existente para outro role (constraints do banco)

### Variáveis de ambiente obrigatórias

```env
# SUPER_ADMIN_EMAIL: qualquer email válido
# Exemplo: admin@visagex.local (DEV), seu-email@empresa.com (produção)
SUPER_ADMIN_EMAIL=seu-email-aqui@empresa.com

# SUPER_ADMIN_PASSWORD: >= 12 caracteres, complexa (recomendado: 16+ caracteres aleatórios)
# Exemplo: gerado com: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
SUPER_ADMIN_PASSWORD=SuaSenhaForte123!@#
```

### Para alterar a senha do Super Admin

1. Mude o valor de `SUPER_ADMIN_PASSWORD` no `.env`
2. Reinicie o backend
3. A função `bootstrapSuperAdmin()` detectará que já existe um super_admin e **não atualizará** (TODO: implementar rotação de senha)

Atualmente, para alterar a senha, é necessário:

- Deletar manualmente o usuário super_admin do banco (`DELETE FROM users WHERE role = 'super_admin'`)
- Reiniciar o backend (criará novo com nova senha)
- Ou usar banco de dados diretamente: `UPDATE users SET password_hash = ... WHERE role = 'super_admin'`

---

## 14. Rotas da API Node.js

```
── Autenticação ──────────────────────────────────────────
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

── Super Admin ───────────────────────────────────────────
GET    /api/admin/tenants
POST   /api/admin/tenants
PATCH  /api/admin/tenants/:id
GET    /api/admin/tenants/:id/stats
GET    /api/admin/plans
POST   /api/admin/plans
GET    /api/admin/recognition-logs          -- logs globais
GET    /api/admin/health                    -- saúde da engine

── Tenant — usuários e cadastro biométrico ───────────────
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id
POST   /api/users/:id/photo                 -- cadastra embedding (admin direto — legado)
DELETE /api/users/:id/embedding             -- remove embedding + invalida cache

── Cadastro via QR Code (enrollment) ────────────────────
POST   /api/students/:id/enrollment-token   -- gera ou regenera QR Code (admin/manager)
GET    /api/students/:id/enrollment-token   -- retorna status do token atual
DELETE /api/students/:id/enrollment-token   -- revoga token ativo (admin/manager)

── Enrollment — autenticados por X-Device-Key + sessionId ─
POST   /api/enrollment/validate-token       -- valida token escaneado, abre sessão Redis
POST   /api/enrollment/consent              -- registra aceite formal do regulamento LGPD
POST   /api/enrollment/refuse               -- registra recusa; facial_status=consent_refused
POST   /api/enrollment/frame                -- envia frame para liveness + captura parcial
POST   /api/enrollment/finalize             -- consolida embedding e fecha sessão

── Tenant — dispositivos ─────────────────────────────────
GET    /api/devices
POST   /api/devices
PATCH  /api/devices/:id
DELETE /api/devices/:id

── Tenant — localizações ─────────────────────────────────
GET    /api/locations
POST   /api/locations
PATCH  /api/locations/:id
DELETE /api/locations/:id

── Tenant — configurações ────────────────────────────────
GET    /api/settings
PATCH  /api/settings                        -- thresholds, modo operação, etc.

── Estrutura acadêmica ───────────────────────────────────
GET    /api/attendance/periods
POST   /api/attendance/periods
PATCH  /api/attendance/periods/:id
GET    /api/attendance/courses
POST   /api/attendance/courses
PATCH  /api/attendance/courses/:id
GET    /api/attendance/classes
POST   /api/attendance/classes
PATCH  /api/attendance/classes/:id          -- inclui total_classes_planned (apenas admin/manager)
GET    /api/attendance/classes/:id/students
POST   /api/attendance/classes/:id/students     -- matrícula
DELETE /api/attendance/classes/:id/students/:userId

── Sessões e presenças ───────────────────────────────────
GET    /api/attendance/sessions
POST   /api/attendance/sessions             -- abre chamada (+ warm cache)
                                            -- body: { class_id, classes_worth }
                                            -- classes_worth: informado pelo professor
GET    /api/attendance/sessions/:id
PATCH  /api/attendance/sessions/:id/close   -- fecha chamada + consolida ausentes
                                            -- atualiza student_class_summary
GET    /api/attendance/sessions/:id/records
PATCH  /api/attendance/records/:id          -- ajuste manual
POST   /api/attendance/records/:id/checkout -- libera saída individual (modo faculdade)

── Relatórios ────────────────────────────────────────────
GET    /api/attendance/reports/frequency    -- ?class_id&period_id
GET    /api/attendance/reports/student/:id  -- histórico do aluno
GET    /api/attendance/reports/student/:id/summary
                                            -- aulas por turma + % frequência

── Auditoria ─────────────────────────────────────────────
GET    /api/audit/recognition-logs          -- ?date&status&user_id
GET    /api/audit/frames/:recognition_log_id -- serve o JPEG via stream
                                            -- requer role admin/manager
                                            -- valida tenant_id

── Dispositivo (autenticado por X-Device-Key) ────────────
POST   /api/device/recognize                -- totem solicita reconhecimento
GET    /api/device/session/current          -- sessão ativa na sala do totem
GET    /api/device/stream                   -- SSE: eventos para o totem
GET    /api/device/heartbeat                -- atualiza last_seen_at
```

---

## 15. Superfícies do sistema

### Super Admin Dashboard

Acessível apenas para `role: super_admin`. Mostra:

- Lista de todos os tenants com status, plano, usuários ativos
- Volume de reconhecimentos por tenant (últimos 7 dias)
- Saúde da engine (GET /health)
- Gestão de planos e limites
- Logs de auditoria globais (sem acesso a frames de tenants)
- Ações: suspender tenant, alterar plano, resetar API Keys

### Tenant Dashboard

Acessível para `admin`, `manager`, `teacher`.

**Admin/Manager:**

- Cadastro de alunos com foto
- Gestão de turmas, cursos e períodos letivos
- Definição de `total_classes_planned` por turma (total de aulas previstas no período)
- Configurações de threshold, modo de operação (escola/faculdade) e janela de pré-presença
- Relatórios de frequência e contagem de aulas por aluno
- Log de reconhecimentos do dia

**Teacher (professor):**

- Abre chamada (informa quantas aulas a sessão representa — padrão 1)
- Vê lista de presença em tempo real (SSE)
- Libera checkout individual de alunos (quando habilitado no tenant)
- Fecha chamada
- Ajusta presenças manualmente com rastreabilidade

### Totem PWA

URL única por tenant + device:
`https://seudominio.com/totem/{device_token}`

**Modo reconhecimento (padrão):**

- Abre câmera automaticamente no carregamento
- Exibe máscara oval centralizada sobre o feed para guiar posicionamento
- Feedback dinâmico de distância via Face Detection API (Chrome/Edge):
  oval cinza → verde quando rosto está no tamanho correto
- Loop automático de captura (sem interação do usuário)
- Crop do bounding box da oval (+ 25% padding) → 320×320 JPEG 80% enviado à engine
- Exibe nome e foto do reconhecido por 3 segundos
- Indicador de status de conexão SSE

**Modo cadastro (registration_mode):**

- Ativado quando aluno escaneia QR Code válido no totem
- Exibe nome do aluno e campo de confirmação antes de prosseguir
- Tela 1: exibe texto integral do regulamento LGPD com botões "Aceitar" / "Recusar"
- Tela 2: captura multi-frame guiada com barra de progresso (N frames configuráveis)
- Feedback visual por frame: verde (liveness ok) / vermelho (reliveness, repetir)
- Tela 3: confirmação de sucesso → volta ao modo reconhecimento automaticamente

**Geral:**

- Sem login — autenticado pela URL com token do dispositivo
- Funciona em qualquer browser moderno (Chrome Android recomendado)
- Sessão de cadastro expira em 10 minutos no Redis; totem retorna ao modo normal

---

## 16. Roadmap pós-MVP

### Fase 2 (3–6 meses pós-hackathon)

- App mobile nativo (React Native) com modo Lock Task (quiosque Android)
- BullMQ para filas assíncronas de reconhecimento
- Redis para warm cache (substituindo cache em memória da engine)
- Schema PostgreSQL separado por tenant (isolamento completo)
- Exportação de relatórios em CSV e PDF
- Integração com sistemas de gestão escolar (TOTVS Educacional, SIE)

### Fase 3 (6–12 meses)

- Anti-spoofing de segunda geração (análise de Fourier + depth sensor)
- Relatórios de frequência em formato exigido pelo MEC
- Multi-região (latência < 100ms para qualquer estado brasileiro)
- API pública para integração com sistemas terceiros

### Fase 4 (12+ meses)

- White-label para revendedores
- Módulo de controle de acesso a laboratórios e espaços restritos
- Análise de comportamento e detecção de anomalias de frequência

---

## 17. Considerações legais

### LGPD — dados biométricos

Embeddings faciais são dados biométricos sensíveis sob a LGPD.

**Consentimento formal obrigatório:**
O VisageX implementa consentimento formal registrado em banco de dados
(`biometric_consents`) antes de qualquer captura de embedding.
O consentimento é coletado diretamente do titular (aluno) no totem,
com exibição integral do regulamento. Versão do texto exibido é registrada
para rastreabilidade em caso de atualização do regulamento.
Se `require_consent_before_facial = true` (padrão), o sistema bloqueia
o cadastro facial sem consentimento registrado.

**Revogação de consentimento:**
Admin pode revogar o consentimento de um aluno (`is_active = false` em
`biometric_consents`). A revogação deve ser acompanhada de exclusão imediata
do embedding (`DELETE facial_embeddings`) e atualização de `facial_status = 'revoked'`.
O sistema não pode usar embeddings de alunos com consentimento revogado.

**Obrigações do operador (você):**

- Documentar finalidade, base legal e prazo de retenção de cada dado
- Garantir exclusão automática dos audit frames após 24h
- Restringir acesso a dados biométricos ao mínimo necessário
- Não usar dados de tenants para treinar modelos sem consentimento explícito
- Disponibilizar mecanismo de exclusão de dados por solicitação do titular

**Obrigações do controlador (tenant / instituição de ensino):**

- Coletar consentimento formal antes do cadastro biométrico (via fluxo QR Code)
- Guardar versão do texto de regulamento exibido ao aluno
- Informar alunos sobre captura de dados biométricos na chamada
- Incluir o uso do sistema na política de privacidade da instituição
- Responder solicitações de titulares (acesso, exclusão, portabilidade)

**Contrato com tenants:**
O contrato de prestação de serviços deve estabelecer claramente
que o tenant é o controlador dos dados de seus alunos
e você é o operador. Isso delimita as responsabilidades de cada parte.

### Consentimento para audit frames

O aluno (ou responsável legal, se menor) precisa ser informado que:

- Sua imagem facial é capturada a cada chamada
- A imagem é retida por até 24 horas para fins de auditoria de fraude
- Após 24 horas a imagem é excluída automaticamente
- Apenas o gestor responsável pode visualizar as imagens dentro do prazo

Essa informação deve constar no regulamento exibido no totem no momento
do cadastro biométrico. O aceite é registrado em `biometric_consents`.

---

## 18. Fluxo de cadastro com QR Code

### Segurança do token

| Camada          | Mecanismo                                                              |
| --------------- | ---------------------------------------------------------------------- |
| Espaço de chave | `crypto.randomBytes(32)` → $2^{256}$ combinações                       |
| Armazenamento   | Apenas `SHA-256(token)` no banco — token bruto descartado              |
| Uso único       | `UPDATE ... WHERE status='pending' RETURNING` em transação atômica     |
| Expiração       | Configurável por tenant (`enrollment_token_expiry_hours`, padrão 72h)  |
| Revogação       | Admin pode revogar antes da expiração; novo token gerado na mesma rota |
| Isolamento      | Token vinculado a `tenant_id` — impossível usar em outro tenant        |

### Anti-fraude no cadastro

| Camada             | Proteção                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| Token pessoal      | QR Code exibe nome do aluno no totem — substituição visível                          |
| Liveness rigoroso  | `liveness_threshold_enrollment` ≥ `liveness_threshold` (padrão 0.90 vs 0.85)         |
| Multi-frame        | Todos os N frames devem passar em liveness antes de avançar                          |
| det_score ≥ 0.85   | Mais rigoroso que reconhecimento (0.75) — rejeita capturas de baixa qualidade        |
| Sessão temporária  | Sessão Redis TTL 10 min — totem não pode acumular tentativas                         |
| Fraud frame        | Frame salvo em disco se liveness falhar no cadastro (mesma lógica do reconhecimento) |
| Auditoria completa | Toda tentativa de uso de token logada com device_fingerprint e IP                    |

### Estados do `facial_status`

```
none
 │
 ├── admin gera QR Code ──────────────────────────► (ainda 'none' até totem)
 │
 ▼
 aluno escaneia QR e recusa regulamento ──────────► consent_refused
 │
 aluno escaneia QR e aceita regulamento ──────────► consent_given
                                                       │
                                                       ▼
                                              captura multi-frame OK
                                                       │
                                                       ▼
                                                  registered
                                                       │
                                        admin/aluno revoga consentimento
                                                       │
                                                       ▼
                                                   revoked
```

### Configurações em `tenant_settings`

| Campo                           | Padrão | Descrição                                                  |
| ------------------------------- | ------ | ---------------------------------------------------------- |
| `enrollment_token_expiry_hours` | 72     | Validade do QR Code em horas                               |
| `require_consent_before_facial` | true   | Bloqueia embedding sem aceite LGPD                         |
| `enrollment_multi_frame_count`  | 3      | Frames capturados e consolidados                           |
| `liveness_threshold_enrollment` | 0.90   | Threshold liveness no cadastro (vs 0.85 no reconhecimento) |

### Sessão Redis de cadastro

Chave: `enrollment_session:{uuid_v4}`  
TTL: 600 segundos (10 minutos)  
Conteúdo:

```json
{
  "userId": 42,
  "tenantId": 7,
  "deviceFingerprint": "abc123...",
  "tokenHash": "sha256...",
  "consentGiven": false,
  "framesCaptured": 0,
  "encryptedEmbeddings": [],
  "createdAt": "2026-05-09T14:00:00Z"
}
```

### Contratos de engine para enrollment

**POST /enroll/frame**

Recebe imagem de um único frame. Aplica SCRFD + liveness + ArcFace.
Threshold liveness configurável (mais rigoroso). Retorna embedding
criptografado **ou** erro de liveness.

**POST /enroll/finalize**

Recebe lista de N embeddings criptografados (já passaram em liveness).
Decifra todos com DEK do tenant, calcula média vetorial, normaliza L2,
re-criptografa e retorna embedding consolidado. Node persiste em
`facial_embeddings` e invalida cache da engine.
