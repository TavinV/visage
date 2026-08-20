"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ScanFace,
  ShieldOff,
  Trash2,
  KeyRound,
  UserRound,
  ShieldCheck,
  Image as ImageIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { maskCpf } from "@/lib/masks";
import { useAuthenticatedImage } from "@/lib/useAuthenticatedImage";
import {
  registersCpf,
  registersEnrollmentCode,
  totemIdentifierLabel,
  useTenantSettings,
} from "@/lib/identification";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  ConfirmDialog,
  Skeleton,
  useToast,
} from "@/components/ui";
import { UserStatusBadge, FacialStatusBadge } from "@/components/app/badges";
import { RolePicker } from "@/components/app/RolePicker";
import { PhotoUpload } from "@/components/app/PhotoUpload";

const UpdateUserSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  email: z.string().email("Informe um e-mail válido.").optional().or(z.literal("")),
  role: z.enum(["admin", "manager", "teacher", "student"], "Selecione o cargo."),
  document: z.string().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
  enrollmentCode: z.string().max(50, "Máximo de 50 caracteres.").optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "pending"], "Selecione o status."),
});

type UpdateUserForm = z.infer<typeof UpdateUserSchema>;

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [confirming, setConfirming] = useState<
    null | "revoke-consent" | "erase-data" | "delete-user"
  >(null);

  const user = useQuery({
    queryKey: ["users", id],
    queryFn: () => api.get<{ data: User }>(`/users/${id}`),
  });

  const photoUrl = useAuthenticatedImage(`/users/${id}/photo`, {
    enabled: user.data?.data.hasPhoto ?? false,
    cacheKey: user.data?.data.photoUpdatedAt,
  });

  const settings = useTenantSettings();
  const identification = settings.data?.data.studentIdentification;
  const cpfRegistered = registersCpf(identification);
  const codeRegistered = registersEnrollmentCode(identification);

  const form = useForm<UpdateUserForm>({ resolver: zodResolver(UpdateUserSchema) });
  const selectedRole = form.watch("role");
  const isStudentForm = selectedRole === "student";
  const showDocument = !isStudentForm || cpfRegistered;

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
        // Campo oculto (aluno em instituição sem CPF) não é enviado: omitir
        // preserva o que já estava gravado em vez de apagá-lo
        ...(showDocument && { document: v.document || null }),
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
      toast.success("Consentimento revogado. O cadastro facial foi removido.");
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
    mutationFn: () => api.post(`/users/${id}/reset-password`),
    onSuccess: () => toast.success("Nova senha temporária enviada por e-mail ao usuário."),
    onError: (error) => toast.error(friendlyError(error)),
  });

  const u = user.data?.data;
  const isStudent = u?.role === "student";

  // O que o aluno digita no totem — muda o texto e o valor exibidos no card
  const totemMode = settings.data?.data.totemIdentification;
  const totemIdentifier = totemIdentifierLabel(totemMode);
  const totemValue =
    totemMode === "enrollment_code"
      ? u?.enrollmentCode
      : u?.document
        ? maskCpf(u.document)
        : u?.enrollmentCode && totemMode === "any"
          ? u.enrollmentCode
          : undefined;

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
        {/* Foto de perfil — alunos não têm (o rosto só existe como biometria) */}
        {u.role !== "student" && (
          <Card className="xl:col-span-2">
            <CardHeader
              title="Foto de perfil"
              description="Normalmente o próprio usuário envia pela tela Minha conta. A secretaria pode enviar por aqui."
              icon={<ImageIcon size={18} strokeWidth={1.75} />}
            />
            <CardBody>
              <PhotoUpload
                name={u.name}
                currentUrl={photoUrl}
                hasPhoto={u.hasPhoto}
                onUpload={async (imageB64) => {
                  await api.put(`/users/${id}/photo`, { imageB64 });
                  await queryClient.invalidateQueries({ queryKey: ["users", id] });
                  toast.success("Foto atualizada.");
                }}
                onRemove={async () => {
                  await api.delete(`/users/${id}/photo`);
                  await queryClient.invalidateQueries({ queryKey: ["users", id] });
                  toast.success("Foto removida.");
                }}
              />
            </CardBody>
          </Card>
        )}

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
                {showDocument && (
                  <Input
                    label="Documento (CPF)"
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    required={isStudentForm && cpfRegistered}
                    error={form.formState.errors.document?.message}
                    {...form.register("document", {
                      onChange: (e) => form.setValue("document", maskCpf(e.target.value)),
                    })}
                  />
                )}
                {isStudentForm && (
                  <Input
                    label="Código de matrícula"
                    required={codeRegistered}
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
              description={`Feito diretamente no totem, com ${totemIdentifier === "matrícula" ? "a" : "o"} ${totemIdentifier} do aluno.`}
              icon={<ScanFace size={18} strokeWidth={1.75} />}
            />
            <CardBody>
              <p className="text-sm leading-relaxed text-flauzino-slate-600">
                Em qualquer totem com <b className="font-semibold">cadastro liberado</b>{" "}
                (aba Dispositivos), o aluno toca em{" "}
                <b className="font-semibold">Cadastrar biometria</b>, digita{" "}
                {totemValue ? (
                  <code className="rounded bg-flauzino-slate-100 px-1.5 py-0.5 font-mono-ds text-xs">
                    {totemValue}
                  </code>
                ) : (
                  <span className="text-flauzino-warning-600">
                    {totemIdentifier} (ainda não cadastrada — preencha o campo acima)
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
              description={
                u.email
                  ? "Gera uma nova senha temporária e envia por e-mail; o usuário a troca no primeiro acesso."
                  : "Cadastre um e-mail acima para liberar o acesso ao painel."
              }
              icon={<KeyRound size={18} strokeWidth={1.75} />}
            />
            <CardBody>
              <Button
                variant="secondary"
                onClick={() => resetPassword.mutate()}
                loading={resetPassword.isPending}
                disabled={!u.email}
                iconLeft={<KeyRound size={15} />}
              >
                Enviar nova senha por e-mail
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
                  Remove o cadastro facial imediatamente. O aluno pode consentir de novo no futuro.
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
                    Apaga a biometria (cadastro facial e QR Codes de cadastro) em definitivo. O cadastro do
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

      <ConfirmDialog
        open={confirming === "revoke-consent"}
        onClose={() => setConfirming(null)}
        onConfirm={() => revokeConsent.mutate()}
        title="Revogar consentimento biométrico"
        description={`O cadastro facial de ${u.name} será removido imediatamente e o reconhecimento deixará de funcionar.`}
        confirmLabel="Revogar consentimento"
        danger
        loading={revokeConsent.isPending}
      />
      <ConfirmDialog
        open={confirming === "erase-data"}
        onClose={() => setConfirming(null)}
        onConfirm={() => eraseData.mutate()}
        title="Excluir dados biométricos"
        description={`Exclusão definitiva da biometria de ${u.name} (cadastro facial e QR Codes de cadastro). O cadastro do usuário é mantido. Esta ação não pode ser desfeita.`}
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
