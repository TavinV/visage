"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/apiError";
import { Logo } from "@/components/ui/Logo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

const LoginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha tem no mínimo 6 caracteres."),
  remember: z.boolean(),
});

const ForgotSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
});

type LoginForm = z.infer<typeof LoginSchema>;
type ForgotForm = z.infer<typeof ForgotSchema>;

function destinationFor(user: { role: string; mustChangePassword?: boolean }): string {
  if (user.mustChangePassword) return "/change-password";
  return user.role === "super_admin" ? "/admin" : "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, restoring, login } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot" | "forgot-sent">("login");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const forgotForm = useForm<ForgotForm>({
    resolver: zodResolver(ForgotSchema),
    defaultValues: { email: "" },
  });

  // Sessão já ativa — vai direto para o console do role
  useEffect(() => {
    if (!restoring && user) router.replace(destinationFor(user));
  }, [restoring, user, router]);

  const onLogin = loginForm.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const logged = await login(values.email, values.password, values.remember);
      router.replace(destinationFor(logged));
    } catch (error) {
      setSubmitError(friendlyError(error));
    }
  });

  const onForgot = forgotForm.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await api.post("/auth/forgot-password", { email: values.email });
      setMode("forgot-sent");
    } catch (error) {
      setSubmitError(friendlyError(error));
    }
  });

  const switchMode = (next: "login" | "forgot") => {
    setSubmitError(null);
    setMode(next);
  };

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca — navy authority com textura de grid */}
      <div
        className="relative hidden flex-1 flex-col justify-between overflow-hidden p-14 text-white lg:flex"
        style={{ background: "radial-gradient(120% 80% at 70% 20%, #13213a 0%, #080d18 70%)" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative">
          <Logo variant="lockup" size={36} className="text-white" />
        </div>
        <div className="relative">
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            Chamada escolar por reconhecimento facial, do cadastro ao relatório.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60 xl:text-base">
            Presença registrada em tempo real, biometria cifrada por instituição e
            conformidade com a LGPD desde o consentimento.
          </p>
        </div>
        <p className="relative text-xs tracking-wide text-white/35">
          Desenvolvido pela Flauzino · Feito para confiar.
        </p>
      </div>

      {/* Painel do formulário — ocupa metade generosa da tela */}
      <div className="flex w-full flex-col justify-center bg-white px-8 py-14 sm:px-16 lg:w-[46%] lg:min-w-[560px] lg:shrink-0 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo variant="lockup" size={32} className="text-flauzino-navy-900" />
          </div>

          {mode === "login" && (
            <form onSubmit={onLogin} className="flex flex-col gap-6" noValidate>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                  Acesso ao console
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-flauzino-navy-900">
                  Entrar na Visage
                </h2>
              </div>

              <Input
                label="E-mail corporativo"
                type="email"
                autoComplete="email"
                placeholder="nome@instituicao.com.br"
                error={loginForm.formState.errors.email?.message}
                {...loginForm.register("email")}
              />
              <Input
                label="Senha"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                error={loginForm.formState.errors.password?.message}
                {...loginForm.register("password")}
              />

              <div className="flex items-center justify-between gap-4">
                <Checkbox label="Lembrar de mim" {...loginForm.register("remember")} />
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-sm font-medium text-flauzino-accent-600 transition-colors hover:text-flauzino-accent-700 hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>

              {submitError && (
                <p role="alert" className="text-sm text-flauzino-danger-600">
                  {submitError}
                </p>
              )}

              <Button type="submit" variant="accent" size="lg" loading={loginForm.formState.isSubmitting} block>
                Entrar
              </Button>

              <p className="text-[13px] text-flauzino-slate-500">
                O acesso é provisionado pela administração da instituição.
              </p>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={onForgot} className="flex flex-col gap-6" noValidate>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-flauzino-accent-600">
                  Redefinição de senha
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-flauzino-navy-900">
                  Esqueceu a senha?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-flauzino-slate-500">
                  Informe o e-mail da sua conta. Enviaremos um link de redefinição
                  válido por 15 minutos.
                </p>
              </div>

              <Input
                label="E-mail corporativo"
                type="email"
                autoComplete="email"
                placeholder="nome@instituicao.com.br"
                error={forgotForm.formState.errors.email?.message}
                {...forgotForm.register("email")}
              />

              {submitError && (
                <p role="alert" className="text-sm text-flauzino-danger-600">
                  {submitError}
                </p>
              )}

              <Button type="submit" variant="accent" size="lg" loading={forgotForm.formState.isSubmitting} block>
                Enviar link de redefinição
              </Button>

              <button
                type="button"
                onClick={() => switchMode("login")}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-flauzino-slate-500 transition-colors hover:text-flauzino-navy-900"
              >
                <ArrowLeft size={15} /> Voltar para o login
              </button>
            </form>
          )}

          {mode === "forgot-sent" && (
            <div className="flex flex-col gap-6">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-flauzino-success-100 text-flauzino-success-600">
                <MailCheck size={26} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-flauzino-navy-900">
                  Verifique seu e-mail
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-flauzino-slate-500">
                  Se houver uma conta com este e-mail, o link de redefinição chega em
                  instantes. Ele expira em <b className="font-semibold">15 minutos</b> e
                  só pode ser usado uma vez.
                </p>
              </div>
              <Button variant="secondary" size="lg" onClick={() => switchMode("login")} block>
                Voltar para o login
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
