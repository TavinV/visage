import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Página não encontrada — Visage",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-flauzino-slate-50 px-6 py-16 text-center">
      <Logo variant="stacked" size={36} className="text-flauzino-navy-900" />

      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/404-not-found.svg"
          alt=""
          aria-hidden="true"
          className="w-64 max-w-full sm:w-80"
        />

        <div className="space-y-1.5 flex flex-col items-center">
          <h1 className="text-5xl font-semibold text-flauzino-navy-900">
            Essa página não existe
          </h1>
          <p className="max-w-sm text-sm text-flauzino-slate-500">
            O endereço pode ter mudado ou nunca existiu. Confira o link ou volte para um
            lugar conhecido.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/">
          <Button>Ir para o início</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Fazer login</Button>
        </Link>
      </div>
    </div>
  );
}
