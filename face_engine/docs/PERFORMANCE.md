# Performance da Engine — diagnóstico e ajuste de CPU

Registro do diagnóstico de latência feito em ago/2026 e das razões por trás dos
parâmetros em `app/core/config.py`. Leia antes de mexer em threading, workers
ou no `docker-compose.yml` da engine.

## O sintoma

Reconhecimentos levavam de 1 a 3,6 segundos, de forma errática — a mesma
operação variava 200× entre requisições consecutivas, sem padrão de carga.

A instrumentação por etapa (`timings_ms` na resposta de `/recognize`) isolou o
culpado imediatamente:

```
detection_ms: 3577, 856, 1294, 897, 1195, 991, 1666, 1687, 12, 527, 2392, 3403, ...
```

A detecção (SCRFD) respondia por 95-99% do tempo total. Liveness, HSV,
descriptografia de candidatos e comparação somavam ~13ms — irrelevantes.
Operações triviais de OpenCV também disparavam: `cv2.cvtColor` (HSV) saltava de
0,3ms para 100ms, e `cv2.imdecode` de 2ms para 96ms.

## A causa raiz

O container roda com cota de cgroup de 2 CPUs, mas as bibliotecas nativas
enxergam os núcleos do **host**:

```
/sys/fs/cgroup/cpu.max  →  200000 100000   (= 2,0 CPUs)
os.cpu_count()          →  12              (núcleos do host)
```

O ONNX Runtime dimensiona o pool de threads de cada sessão por `os.cpu_count()`
quando `SessionOptions` não é fornecido. Com o `buffalo_s` carregando **cinco**
modelos (detection, recognition, genderage, landmark_2d_106, landmark_3d_68), o
processo abria dezenas de threads disputando 2 núcleos reais. O resultado é
_throttling_ de CFS e troca de contexto — daí a variação de 12ms a 3600ms.

Agravante: dos cinco modelos, o pipeline só usa **dois**. Os outros três eram
executados a cada rosto e o resultado, descartado.

## As medições

Benchmark sobre 20 frames reais capturados no totem, 3 repetições cada
(60 detecções por configuração), dentro do container com a cota de 2 CPUs:

| Configuração | mean | p50 | p95 | max |
|---|---:|---:|---:|---:|
| Original (5 módulos, threads default) | 1491,1 | 1413,8 | 2195,7 | 2588,9 |
| `allowed_modules` (2 módulos) | 189,8 | 195,8 | 304,7 | 389,7 |
| 2 módulos + `intra_op=2` | 18,0 | 11,2 | 52,4 | 55,1 |
| **2 módulos + `intra_op=1`** ← adotada | **17,3** | 17,0 | **20,2** | **25,4** |
| 2 módulos + `intra_op=2` + `cv2=1` | 26,7 | 17,4 | 67,1 | 71,8 |

Todas as configurações detectaram as mesmas 60 faces — nenhuma perda de
detecção.

### Por que `intra_op=1` e não `intra_op=2`

`intra_op=2` tem p50 melhor (11,2 vs 17,0ms), mas cauda muito pior
(p95 52,4 vs 20,2ms). Mais importante: com `intra_op=1` **cada requisição ocupa
apenas 1 núcleo**, deixando o outro livre para uma requisição concorrente. É o
que permite atender dois totens em paralelo sem disputa — validado no teste de
carga abaixo.

## Equivalência biométrica

Restringir `allowed_modules` não altera o resultado biométrico. Comparação
direta entre a configuração antiga e a nova sobre a mesma imagem:

```json
{
  "det_score_igual": true,
  "bbox_max_diff_px": 0.0,
  "embedding_cosine_similarity": 1.0,
  "embedding_max_diff_por_dimensao": 0.0
}
```

Bit-idêntico. **Nenhum aluno precisa recadastrar a biometria e nenhum threshold
precisa ser recalibrado.**

## Resultado end-to-end

`POST /recognize` completo (detecção + liveness V1/V2 + HSV + embedding):

| Cenário | p50 | p95 | throughput |
|---|---:|---:|---:|
| Sequencial | 31,6ms | 36,4ms | — |
| 2 concorrentes | 32,4ms | 67,5ms | 48,9 req/s |
| 4 concorrentes | 73,5ms | 90,8ms | 53,8 req/s |

Duas requisições simultâneas terminam praticamente no mesmo tempo de uma
sozinha — confirma o paralelismo real do pool de threads. Com 4 concorrentes a
cota de 2 CPUs satura e a latência degrada de forma previsível, sem colapso.

## Por que `workers=1` continua obrigatório

O `MemoryEmbeddingCache` vive na memória do processo e **não tem TTL**
(`app/infra/cache_memory.py`). Com N workers do Uvicorn, um
`DELETE /embeddings/{tenant}/{person}` — emitido quando um aluno refaz o
cadastro biométrico — invalidaria o cache de apenas um dos processos. Os demais
continuariam servindo o embedding antigo **indefinidamente**.

A concorrência vem do `ThreadPoolExecutor` interno (`ENGINE_THREAD_POOL_SIZE`),
que usa a cota de CPU inteira sobre as mesmas sessões ONNX (thread-safe para
`Run()` concorrente), sem duplicar modelos na memória e sem quebrar a
invalidação de cache.

Para subir de workers no futuro seria preciso, antes, resolver a invalidação
entre processos — via TTL no cache ou um canal de invalidação compartilhado.

## Parâmetros e onde ajustar

Todos configuráveis por variável de ambiente (ver `app/core/config.py`):

| Variável | Padrão | Observação |
|---|---|---|
| `ONNX_INTRA_OP_THREADS` | 1 | Threads por inferência. 1 = melhor cauda + paralelismo entre requisições |
| `ONNX_INTER_OP_THREADS` | 1 | Paralelismo entre ramos do grafo |
| `CV2_NUM_THREADS` | 2 | Alinhar à cota de CPU |
| `ENGINE_THREAD_POOL_SIZE` | 2 | Requisições simultâneas em inferência. Alinhar à cota de CPU |
| `SAVE_AUDIT_FRAMES` | false | Custa 90-200ms de CPU por requisição; grava em diretório não montado |

**Ao mudar o limite de CPU** em `docker-compose.yml`, ajuste junto:
`ENGINE_THREAD_POOL_SIZE`, `CV2_NUM_THREADS` e as variáveis `*_NUM_THREADS` do
`Dockerfile` (OMP/OpenBLAS/MKL/NumExpr), que também não leem a cota do cgroup.

## Sobre `SAVE_AUDIT_FRAMES`

Desligado por padrão. Os frames eram gravados em `audit_frames/`, que **não é
volume montado** — some a cada recriação do container. Os frames com valor
legal (tentativas de fraude, para LGPD) são gravados pelo **backend** em
`fraud_frames/`, esse sim persistido. O encode JPEG consumia 90-200ms da mesma
cota de CPU de que a próxima requisição precisava. Ligue apenas para depuração
pontual.
