"use client";

import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  useToast,
} from "@/components/ui";

const RotatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(12, "A nova senha precisa de pelo menos 12 caracteres."),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type RotateForm = z.infer<typeof RotatePasswordSchema>;

export default function AccountPage() {
  const { user } = useAuth();
  const toast = useToast();

  const form = useForm<RotateForm>({
    resolver: zodResolver(RotatePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const rotate = useMutation({
    mutationFn: (v: RotateForm) =>
      api.post("/admin/rotate-password", {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      }),
    onSuccess: () => {
      toast.success("Senha rotacionada. Use a nova senha no próximo acesso.");
      form.reset();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Conta"
        description="Credenciais da conta de super administração da plataforma."
      />

      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader title="Identidade" icon={<UserRound size={18} strokeWidth={1.75} />} />
          <CardBody>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-flauzino-slate-500">Nome</dt>
                <dd className="mt-1 text-sm font-medium text-flauzino-navy-900">{user?.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-flauzino-slate-500">E-mail</dt>
                <dd className="mt-1 font-mono-ds text-sm text-flauzino-navy-900">{user?.email}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Rotacionar senha"
            description="A conta de super admin é única — rotacione a senha periodicamente."
            icon={<KeyRound size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <form
              className="flex max-w-sm flex-col gap-4"
              onSubmit={form.handleSubmit((v) => rotate.mutate(v))}
            >
              <Input
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                required
                error={form.formState.errors.currentPassword?.message}
                {...form.register("currentPassword")}
              />
              <Input
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                required
                hint="Mínimo de 12 caracteres."
                error={form.formState.errors.newPassword?.message}
                {...form.register("newPassword")}
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                required
                error={form.formState.errors.confirmPassword?.message}
                {...form.register("confirmPassword")}
              />
              <div>
                <Button type="submit" loading={rotate.isPending}>
                  Rotacionar senha
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
