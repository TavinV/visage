import type { Metadata } from "next";
import { AppProviders } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Definir nova senha — Visage",
  description: "Troque a senha temporária no primeiro acesso ao console.",
};

export default function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
