"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Copy, ScanFace, ShieldOff, Trash2, KeyRound, UserRound, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { maskCpf } from "@/lib/masks";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  Skeleton,
  useToast,
} from "@/components/ui";
import { UserStatusBadge, FacialStatusBadge } from "@/components/app/badges";
import { RolePicker } from "@/components/app/RolePicker";

const UpdateUserSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  email: z.string().email("Informe um e-mail válido.").optional().or(z.literal("")),
  role: z.enum(["admin", "manager", "teacher", "student"], "Selecione o cargo."),
  document: z.string().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
  enrollmentCode: z.string().max(50, "Máximo de 50 caracteres.").optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "pending"], "Selecione o status."),
});

type UpdateUserForm = z.infer<typeof UpdateUserSchema>;

function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard.writeText(text).then(onDone);
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<
    null | "revoke-consent" | "erase-data" | "delete-user"
  >(null);

  const user = useQuery({
    queryKey: ["users", id],
    queryFn: () => api.get<{ data: User }>(`/users/${id}`),
  });

  const form = useForm<UpdateUserForm>({ resolver: zodResolver(UpdateUserSchema) });
  const selectedRole = form.watch("role");

  useEffect(() => {
    const u = user.data?.data;
    if (!u) return;
    form.reset({
      name: u.name,
      email: u.email ?? "",
      role: u.role === "super_admin" ? "admin" : u.role,
      document: u.document ? maskCpf(u.document) : "",
      enrollmentCode: u.enrollmentCode ?? "",
      status: u.status,
    });
  }, [user.data, form]);

  const update = useMutation({
    mutationFn: (v: UpdateUserForm) =>
      api.put(`/users/${id}`, {
        name: v.name,
        email: v.email || undefined,
        role: v.role,
        document: v.document || null,
        enrollmentCode: v.role === "student" ? v.enrollmentCode || null : null,
        status: v.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário atualizado.");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const revokeConsent = useMutation({
    mutationFn: () => api.post(`/users/${id}/revoke-consent`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Consentimento revogado. Os embeddings foram removidos.");
      setConfirming(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const eraseData = useMutation({
    mutationFn: () => api.delete(`/users/${id}/data`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Dados biométricos excluídos definitivamente.");
      setConfirming(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const deleteUser = useMutation({
    mutationFn: () => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuário excluído.");
      router.replace("/dashboard/users");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const resetPassword = useMutation({
    mutationFn: () =>
      api.post<{ data: { temporaryPassword: string } }>(`/users/${id}/reset-password`),
    onSuccess: (res) => setTempPassword(res.data.temporaryPassword),
    onError: (error) => toast.error(friendlyError(error)),
  });

  const u = user.data?.data;
  const isStudent = u?.role === "student";

  if (user.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full max-w-3xl" />
      </div>
    );
  }

  if (user.isError || !u) {
    return (
      <div>
        <PageHeader title="Usuário não encontrado" description={friendlyError(user.error)} />
        <Link href="/dashboard/users">
          <Button variant="secondary" iconLeft={<ArrowLeft size={15} />}>Voltar para usuários</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <Link
          href="/dashboard/users"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-flauzino-slate-500 transition-colors hover:text-flauzino-accent-600"
        >
          <ArrowLeft size={15} /> Usuários
        </Link>
      </div>

      <PageHeader
        title={u.name}
        description={u.email ?? "Sem e-mail cadastrado"}
        actions={
          <div className="flex items-center gap-2">
            <UserStatusBadge status={u.status} />
            <FacialStatusBadge status={u.facialStatus} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Dados cadastrais */}
        <Card className="xl:col-span-2">
          <CardHeader title="Dados cadastrais" icon={<UserRound size={18} strokeWidth={1.75} />} />
          <CardBody>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit((v) => update.mutate(v))}
            >
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <RolePicker
                    value={field.value}
                    onChange={field.onChange}
                    error={form.formState.errors.role?.message}
                  />
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Nome completo"
                  required
                  error={form.formState.errors.name?.message}
                  {...form.register("name")}
                />
                <Input
                  label="E-mail"
                  type="email"
                  error={form.formState.errors.email?.message}
                  {...form.register("email")}
                />
                <Input
                  label="Documento (CPF)"
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  error={form.formState.errors.document?.message}
                  {...form.register("document", {
                    onChange: (e) => form.setValue("document", maskCpf(e.target.value)),
                  })}
                />
                {selectedRole === "student" && (
                  <Input
                    label="Código de matrícula"
                    error={form.formState.errors.enrollmentCode?.message}
                    {...form.register("enrollmentCode")}
                  />
                )}
                <Select
                  label="Status"
                  required
                  options={[
                    { value: "active", label: "Ativo" },
                    { value: "inactive", label: "Inativo" },
                    { value: "pending", label: "Pendente" },
                  ]}
                  error={form.formState.errors.status?.message}
                  {...form.register("status")}
                />
              </div>
              <div>
                <Button type="submit" loading={update.isPending}>
                  Salvar alterações
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Cadastro biométrico — feito direto no totem, sem QR */}
        {isStudent && (
          <Card>
            <CardHeader
              title="Cadastro biométrico"
              description="Feito diretamente no totem, com o CPF do aluno."
              icon={<ScanFace size={18} strokeWidth={1.75} />}
            />
            <CardBody>
              <p className="text-sm leading-relaxed text-flauzino-slate-600">
                Em qualquer totem com <b className="font-semibold">cadastro liberado</b>{" "}
                (aba Dispositivos), o aluno toca em{" "}
                <b className="font-semibold">Cadastrar biometria</b>, digita o CPF{" "}
                {u.document ? (
                  <code className="rounded bg-flauzino-slate-100 px-1.5 py-0.5 font-mono-ds text-xs">
                    {maskCpf(u.document)}
                  </code>
                ) : (
                  <span className="text-flauzino-warning-600">
                    (ainda não cadastrado — preencha o CPF acima)
                  </span>
                )}{" "}
                e segue as instruções na tela.
              </p>
            </CardBody>
          </Card>
        )}

        {/* Acesso ao painel — apenas quem tem e-mail/senha */}
        {!isStudent && (
          <Card>
            <CardHeader
              title="Acesso ao painel"
              description="Gera uma senha temporária que o usuário troca no primeiro acesso."
              icon={<KeyRound size={18} strokeWidth={1.75} />}
            />
            <CardBody>
              <Button
                variant="secondary"
                onClick={() => resetPassword.mutate()}
                loading={resetPassword.isPending}
                iconLeft={<KeyRound size={15} />}
              >
                Gerar senha temporária
              </Button>
            </CardBody>
          </Card>
        )}

        {/* LGPD */}
        <Card>
          <CardHeader
            title="Privacidade (LGPD)"
            description="Ações irreversíveis sobre os dados biométricos do titular."
            icon={<ShieldCheck size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-flauzino-navy-900">Revogar consentimento</p>
                <p className="text-xs text-flauzino-slate-500">
                  Remove os embeddings faciais imediatamente. O aluno pode consentir de novo no futuro.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirming("revoke-consent")}
                iconLeft={<ShieldOff size={14} />}
              >
                Revogar
              </Button>
            </div>
            <div className="border-t border-flauzino-slate-200 pt-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-flauzino-navy-900">
                    Excluir dados biométricos
                  </p>
                  <p className="text-xs text-flauzino-slate-500">
                    Apaga a biometria (embeddings e tokens de cadastro) em definitivo. O cadastro do
                    usuário é mantido.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirming("erase-data")}
                  iconLeft={<Trash2 size={14} />}
                >
                  Excluir dados
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Exclusão do usuário */}
        <Card className="xl:col-span-2">
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-flauzino-navy-900">Excluir usuário</p>
              <p className="text-xs text-flauzino-slate-500">
                Remove o cadastro por completo. Prefira inativar quando houver histórico de presença.
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirming("delete-user")}>
              Excluir usuário
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Senha temporária — exibida uma única vez */}
      <Modal
        open={tempPassword !== null}
        onClose={() => setTempPassword(null)}
        title="Senha temporária gerada"
        description="Entregue ao usuário por um canal seguro. Ela não será exibida novamente."
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setTempPassword(null)}>
            Concluir
          </Button>
        }
      >
        {tempPassword && (
          <div className="flex items-center gap-2 rounded-lg bg-flauzino-slate-100 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono-ds text-sm text-flauzino-navy-900">
              {tempPassword}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(tempPassword, () => toast.success("Senha copiada."))}
              iconLeft={<Copy size={14} />}
            >
              Copiar
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirming === "revoke-consent"}
        onClose={() => setConfirming(null)}
        onConfirm={() => revokeConsent.mutate()}
        title="Revogar consentimento biométrico"
        description={`Os embeddings faciais de ${u.name} serão removidos imediatamente e o reconhecimento deixará de funcionar.`}
        confirmLabel="Revogar consentimento"
        danger
        loading={revokeConsent.isPending}
      />
      <ConfirmDialog
        open={confirming === "erase-data"}
        onClose={() => setConfirming(null)}
        onConfirm={() => eraseData.mutate()}
        title="Excluir dados biométricos"
        description={`Exclusão definitiva da biometria de ${u.name} (embeddings e tokens de cadastro). O cadastro do usuário é mantido. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir definitivamente"
        danger
        loading={eraseData.isPending}
      />
      <ConfirmDialog
        open={confirming === "delete-user"}
        onClose={() => setConfirming(null)}
        onConfirm={() => deleteUser.mutate()}
        title="Excluir usuário"
        description={`O cadastro de ${u.name} será removido. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir usuário"
        danger
        loading={deleteUser.isPending}
      />
    </div>
  );
}
