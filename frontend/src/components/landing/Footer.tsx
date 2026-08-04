import Link from "next/link";
import { Wordmark } from "./primitives";

const COLS = [
  {
    title: "Produto",
    links: [
      { label: "Como funciona", href: "#plataforma" },
      { label: "Antifraude", href: "#antifraude" },
      { label: "Recursos", href: "#recursos" },
      { label: "Segurança", href: "#seguranca" },
    ],
  },
  {
    title: "Planos",
    links: [
      { label: "Escola", href: "/demonstracao?plano=Escola" },
      { label: "Campus", href: "/demonstracao?plano=Campus" },
      { label: "Personalizado", href: "/demonstracao?plano=Personalizado" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Demonstração", href: "/demonstracao" },
      { label: "Privacidade & LGPD", href: "#seguranca" },
      { label: "Contato", href: "mailto:contato@visage.app" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              A primeira chamada com reconhecimento facial do Brasil: presença
              automática, segura e em conformidade com a LGPD.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-600 transition-colors hover:text-brand-700"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
          <span className="text-xs text-slate-400">
            © {new Date().getFullYear()} Visage · Todos os direitos reservados
          </span>
          <span className="text-xs text-slate-400">
            contato@visage.app
          </span>
        </div>
      </div>
    </footer>
  );
}
