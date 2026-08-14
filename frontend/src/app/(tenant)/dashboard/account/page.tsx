"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { useAuthenticatedImage } from "@/lib/useAuthenticatedImage";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Skeleton,
  useToast,
} from "@/components/ui";
import { PhotoUpload } from "@/components/app/PhotoUpload";
import { roleLabel } from "@/components/app/labels";

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "Mínimo de 8 caracteres."),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

type PasswordForm = z.infer<typeof PasswordSchema>;

/**
 * Conta do próprio usuário: foto de perfil e senha.
 *
 * A foto é self-service — cada um envia a sua. Alunos não aparecem aqui:
 * eles não têm acesso ao console.
 */
export default function AccountPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const profile = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api.get<{ data: User }>("/users/me/profile"),
  });

  const me = profile.data?.data;
  const photoUrl = useAuthenticatedImage(me ? `/users/${me.id}/photo` : null, {
    enabled: me?.hasPhoto ?? false,
    cacheKey: me?.photoUpdatedAt,
  });

  const form = useForm<PasswordForm>({ resolver: zodResolver(PasswordSchema) });

  const changePassword = useMutation({
    mutationFn: (v: PasswordForm) =>
      api.put("/users/change-password", {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      }),
    onSuccess: () => {
      toast.success("Senha alterada.");
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const refreshProfile = () =>
    queryClient.invalidateQueries({ queryKey: ["me-profile"] });

  if (profile.isPending) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (profile.isError || !me) {
    return <PageHeader title="Minha conta" description={friendlyError(profile.error)} />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Minha conta"
        description={`${roleLabel(me.role)}${me.email ? ` · ${me.email}` : ""}`}
      />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Foto de perfil"
            description="Aparece ao lado do seu nome no console. Só você precisa enviá-la."
            icon={<UserRound size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <PhotoUpload
              name={me.name}
              currentUrl={photoUrl}
              hasPhoto={me.hasPhoto}
              onUpload={async (imageB64) => {
                await api.put("/users/me/photo", { imageB64 });
                await refreshProfile();
                toast.success("Foto atualizada.");
              }}
              onRemove={async () => {
                await api.delete("/users/me/photo");
                await refreshProfile();
                toast.success("Foto removida.");
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Senha"
            description="Use uma senha que você não utilize em outros serviços."
            icon={<KeyRound size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit((v) => changePassword.mutate(v))}
            >
              <Input
                label="Senha atual"
                type="password"
                required
                autoComplete="current-password"
                error={form.formState.errors.currentPassword?.message}
                {...form.register("currentPassword")}
              />
              <Input
                label="Nova senha"
                type="password"
                required
                autoComplete="new-password"
                error={form.formState.errors.newPassword?.message}
                {...form.register("newPassword")}
              />
              <Input
                label="Repita a nova senha"
                type="password"
                required
                autoComplete="new-password"
                error={form.formState.errors.confirmPassword?.message}
                {...form.register("confirmPassword")}
              />
              <div>
                <Button type="submit" loading={changePassword.isPending}>
                  Alterar senha
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
