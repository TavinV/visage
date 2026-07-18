"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/apiError";
import { Logo } from "@/components/ui/Logo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const ResetSchema = z
  .object({
    newPassword: z.string().min(8, "Mínimo de 8 caracteres."),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type ResetForm = z.infer<typeof ResetSchema>;

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ResetForm>({
    resolver: zodResolver(ResetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await api.post("/auth/reset-password", { token, newPassword: values.newPassword });
      setDone(true);
    } catch (error) {
      setSubmitError(friendlyError(error));
    }
  });

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(120% 80% at 70% 20%, #13213a 0%, #080d18 70%)" }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-7">
        <Logo variant="lockup" size={36} className="text-white" />

        <div className="w-full rounded-xl border border-flauzino-slate-200 bg-white p-8 shadow-fl-xl sm:p-10">
          {!token ? (
            <div className="flex flex-col gap-5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-flauzino-warning-100 text-flauzino-warning-600">
                <ShieldAlert size={26} strokeWidth={1.75} />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                  Link incompleto
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-flauzino-slate-500">
                  Este endereço não contém um token de redefinição. Solicite um novo
                  link na tela de login.
                </p>
              </div>
              <Link href="/login">
                <Button variant="secondary" block>Ir para o login</Button>
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col gap-5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-flauzino-success-100 text-flauzino-success-600">
                <CheckCircle2 size={26} strokeWidth={1.75} />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                  Senha redefinida
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-flauzino-slate-500">
                  Sua nova senha já está ativa. Entre novamente para acessar o console.
                </p>
              </div>
              <Link href="/login">
                <Button variant="accent" size="lg" block>Entrar na Visage</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                  Redefinição de senha
                </p>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
                  Defina a nova senha
                </h1>
                <p className="mt-2 text-sm text-flauzino-slate-500">
                  O link é de uso único e expira em 15 minutos.
                </p>
              </div>

              <Input
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                hint="Mínimo de 8 caracteres."
                error={form.formState.errors.newPassword?.message}
                {...form.register("newPassword")}
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                error={form.formState.errors.confirmPassword?.message}
                {...form.register("confirmPassword")}
              />

              {submitError && (
                <p role="alert" className="text-sm text-flauzino-danger-600">
                  {submitError}
                </p>
              )}

              <Button type="submit" variant="accent" size="lg" loading={form.formState.isSubmitting} block>
                Salvar nova senha
              </Button>
            </form>
          )}
        </div>

        <p className="text-xs text-white/45">
          Desenvolvido pela Flauzino · Feito para confiar.
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams exige Suspense no App Router
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
