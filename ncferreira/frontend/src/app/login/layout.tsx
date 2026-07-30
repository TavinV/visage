import type { Metadata } from "next";
import { AppProviders } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Entrar — Visage",
  description: "Acesso ao console administrativo da Visage.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
