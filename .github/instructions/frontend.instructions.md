---
description: "Use quando criar ou editar páginas, componentes, hooks ou layouts do frontend VisageX. Cobre Next.js 14 App Router, ShadCN/UI, Tailwind, SSE para presença em tempo real, Canvas API para captura de frame e autenticação com JWT."
applyTo: "frontend/**"
---

# Frontend — Next.js 14 App Router + ShadCN/UI

## Estrutura de pastas

```
frontend/src/
  app/              — rotas App Router (page.tsx, layout.tsx, loading.tsx, error.tsx)
    (auth)/         — páginas sem sidebar (login, etc.)
    (dashboard)/    — páginas autenticadas com layout compartilhado
  components/
    ui/             — componentes ShadCN (não editar diretamente)
    [feature]/      — componentes por domínio (attendance/, totem/, users/…)
  hooks/            — hooks reutilizáveis (useAttendanceSSE, useCamera, …)
  lib/              — api.ts (fetch wrapper), auth.ts, utils.ts
  types/            — interfaces TypeScript
```

## App Router — regras

- Cada rota com `page.tsx` deve ter `loading.tsx` e `error.tsx` no mesmo diretório
- Componentes server-side por padrão; adicionar `'use client'` apenas quando necessário (interatividade, hooks, SSE)
- Nunca usar `pages/` — apenas App Router
- Layouts compartilhados ficam em `layout.tsx` do segmento pai

```typescript
// page.tsx — server component por padrão
export default async function AttendancePage({ params }: { params: { sessionId: string } }) {
  const session = await fetchSession(params.sessionId); // fetch server-side
  return <AttendancePanel session={session} />;
}
```

## Componentes com ShadCN/UI

Sempre usar componentes ShadCN quando disponível. Nunca criar botões, inputs ou cards do zero:

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
```

Variantes de `Button`: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`.

## SSE — presença em tempo real

```typescript
"use client";
import { useEffect, useState } from "react";

export function useAttendanceSSE(sessionId: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    const es = new EventSource(`/api/attendance/sessions/${sessionId}/stream`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setRecords((prev) => [...prev, data]);
    };

    return () => es.close(); // cleanup obrigatório
  }, [sessionId]);

  return records;
}
```

## Canvas API — captura de frame (Totem PWA)

```typescript
"use client";
// Captura 3 frames com intervalo de 250ms, calcula variação de pixels
// e envia o segundo frame se variação ≥ 3.0 (estático = descarta)
const captureFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string => {
  const ctx = canvas.getContext("2d")!;
  canvas.width = 160;
  canvas.height = 120;
  ctx.drawImage(video, 0, 0, 160, 120);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1]; // base64 sem prefixo
};
```

## Fetch / API calls

```typescript
// lib/api.ts já exporta um wrapper com token JWT no header
import { api } from "@/lib/api";

const session = await api.post("/attendance/sessions", {
  classId,
  classesWorth,
});
```

## Formulários

Usar `react-hook-form` + `zod` + ShadCN Form:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
```

## Tailwind

- Usar classes utilitárias diretamente — sem CSS modules ou styled-components
- Paleta do projeto: usar variáveis CSS do ShadCN (`bg-background`, `text-foreground`, `border`, etc.)
- Responsividade mobile-first: `sm:`, `md:`, `lg:`
