---
description: "Detecta e reporta automaticamente mudanças estruturais ao CHANGELOG.md baseado em git diff de context/claude.md"
argument-hint: "Descrição da mudança (ex: Registro de escolas via webhook de pagamento)"
agent: agent
tools: [execute, search, read, edit]
---

Vou detectar a mudança estrutural em `context/claude.md` e adicionar uma entrada automática ao `CHANGELOG.md`.

## Processo

1. Analisa `git diff context/claude.md` para detectar:
   - Mudanças de schema (tabelas, colunas)
   - Mudanças de fluxo (novos passos, remoções)
   - Mudanças de modo de operação (flags de tenant)
   - Mudanças de segurança (criptografia, isolamento)
   - Novos endpoints ou remoções

2. Gera entrada no CHANGELOG com:
   - Data atual
   - Status: "Em progresso"
   - Impactos listados por serviço (backend, frontend, engine, banco)

3. Sua descrição (se fornecida) aparece como título da mudança

## Sua entrada

$input

Após concluído, você verá a entrada proposta e poderá fazer commit para `.github/CHANGELOG.md`.
