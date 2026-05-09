---
description: "Cria uma página Next.js 14 App Router completa com layout, loading, error boundary e componentes ShadCN"
argument-hint: "Nome e propósito da página (ex: página de lista de turmas do professor)"
agent: agent
tools: [read, edit, search]
---

Crie uma página para o frontend VisageX seguindo as instruções em [frontend.instructions.md](../instructions/frontend.instructions.md).

## Requisitos

A página deve incluir:

1. `page.tsx` no diretório correto dentro de `frontend/src/app/(dashboard)/`
2. `loading.tsx` com skeleton usando ShadCN `Skeleton`
3. `error.tsx` com `'use client'` e botão de retry
4. Componentes em `frontend/src/components/[domínio]/`
5. Usar ShadCN/UI — nunca criar UI primitiva do zero
6. Se tiver dados em tempo real: hook `useAttendanceSSE` ou similar com `EventSource`
7. Formulários com `react-hook-form` + `zod` + ShadCN Form

## Página solicitada

$input

Consulte `context/claude.md` para entender o fluxo de negócio da página.
