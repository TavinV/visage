import type { Metadata } from "next";
import { AppProviders } from "@/lib/providers";
import { Guard } from "@/components/app/Guard";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: "Console — Visage",
  description: "Console de administração global da plataforma Visage.",
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <Guard allow={["super_admin"]}>
        <AppShell variant="admin">
          {children}
        </AppShell>
      </Guard>
    </AppProviders>
  );
}
