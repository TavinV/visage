"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/apiError";
import { Logo } from "@/components/ui/Logo";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const ChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha temporária."),
    newPassword: z.string().min(8, "Mínimo de 8 caracteres."),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "A nova senha precisa ser diferente da temporária.",
    path: ["newPassword"],
  });

type ChangeForm = z.infer<typeof ChangeSchema>;

/** Primeiro acesso: troca obrigatória da senha temporária antes do console. */
export default function ChangePasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, restoring } = useAuth();

  useEffect(() => {
    if (restoring) return;
    if (!user) router.replace("/login");
    else if (!user.mustChangePassword) {
      router.replace(user.role === "super_admin" ? "/admin" : "/dashboard");
    }
  }, [user, restoring, router]);

  const form = useForm<ChangeForm>({
    resolver: zodResolver(ChangeSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.put("/users/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Atualiza o usuário salvo — o Guard deixa de exigir a troca
      if (user) {
        const updated = { ...user, mustChangePassword: false };
        tokenStore.setStoredUser(updated);
      }
      toast.success("Senha definida. Bem-vindo à Visage.");
      // Recarrega para o AuthProvider reidratar o usuário atualizado
      window.location.assign(user?.role === "super_admin" ? "/admin" : "/dashboard");
    } catch (error) {
      toast.error(friendlyError(error));
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
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-flauzino-accent-50 text-flauzino-accent-600">
            <KeyRound size={22} strokeWidth={1.75} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-flauzino-navy-900">
            Defina a sua senha
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-flauzino-slate-500">
            Este é o seu primeiro acesso. Troque a senha temporária por uma senha
            pessoal para continuar.
          </p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Input
              label="Senha temporária"
              type="password"
              autoComplete="current-password"
              error={form.formState.errors.currentPassword?.message}
              {...form.register("currentPassword")}
            />
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
            <Button
              type="submit"
              variant="accent"
              size="lg"
              loading={form.formState.isSubmitting}
              block
              className="mt-1"
            >
              Salvar e entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
