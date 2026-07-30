import type { Metadata } from "next";
import { AppProviders } from "@/lib/providers";
import { Guard } from "@/components/app/Guard";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: "Painel — Visage",
  description: "Painel administrativo da instituição na plataforma Visage.",
};

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <Guard allow={["admin", "manager", "teacher"]}>
        <AppShell variant="tenant">
          {children}
        </AppShell>
      </Guard>
    </AppProviders>
  );
}
