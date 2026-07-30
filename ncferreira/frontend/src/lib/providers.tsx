"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "./api";

/** Providers da aplicação autenticada (login + consoles). A landing não os usa. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // Alt-tab não deve redisparar todas as queries da página — em
            // conjunto com o polling do totem isso estourava o rate limit.
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // 4xx não se resolve repetindo a chamada
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
