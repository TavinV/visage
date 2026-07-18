import { Wordmark } from "./primitives";

const COLS = [
  {
    title: "Produto",
    links: [
      { label: "Como funciona", href: "#story" },
      { label: "Presença", href: "#presenca" },
      { label: "Segurança", href: "#seguranca" },
      { label: "Velocidade", href: "#velocidade" },
    ],
  },
  {
    title: "Planos",
    links: [
      { label: "Starter", href: "#demo" },
      { label: "Escola", href: "#demo" },
      { label: "Instituto", href: "#demo" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Design System", href: "/design-system" },
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
              A chamada que se faz sozinha. Reconhecimento facial para frequência
              escolar — preciso, seguro e em conformidade com a LGPD.
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
                    <a
                      href={l.href}
                      className="text-sm text-slate-600 transition-colors hover:text-brand-700"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
          <span className="text-xs text-slate-400">
            © {new Date().getFullYear()} Visage · Hackathon UMC 2026
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Poppins · Tailwind · Next.js 14
          </span>
        </div>
      </div>
    </footer>
  );
}
