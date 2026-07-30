import type { Metadata } from "next";
import { AppProviders } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Redefinir senha — Visage",
  description: "Defina uma nova senha de acesso ao console da Visage.",
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
