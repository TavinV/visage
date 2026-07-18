"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Play, Pause, XCircle, KeyRound, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Paginated, Plan, RotateDekResult, Tenant } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import { useDebounced } from "@/lib/useDebounced";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  Tr,
  TableState,
  Pagination,
  Button,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  useToast,
} from "@/components/ui";
import { TenantStatusBadge } from "@/components/app/badges";
import { maskCnpj } from "@/lib/masks";

const CreateTenantSchema = z.object({
  name: z.string().min(3, "Informe o nome da instituição."),
  document: z.string().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
  institutionType: z.enum(["school", "university"], "Selecione o tipo."),
  planId: z.string().min(1, "Selecione um plano."),
  adminName: z.string().min(1, "Informe o nome do administrador."),
  adminEmail: z.string().email("Informe um e-mail válido."),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(3, "Informe o nome da instituição."),
  document: z.string().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
  institutionType: z.enum(["school", "university"], "Selecione o tipo."),
  planId: z.string().optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
});

type CreateForm = z.infer<typeof CreateTenantSchema>;
type UpdateForm = z.infer<typeof UpdateTenantSchema>;

type RowAction =
  | { kind: "activate"; tenant: Tenant }
  | { kind: "deactivate"; tenant: Tenant }
  | { kind: "cancel"; tenant: Tenant }
  | { kind: "rotate-key"; tenant: Tenant };

const actionCopy: Record<RowAction["kind"], { title: string; description: (name: string) => string; confirm: string; danger: boolean }> = {
  activate: {
    title: "Ativar instituição",
    description: (n) => `"${n}" voltará a acessar o painel e registrar presenças.`,
    confirm: "Ativar instituição",
    danger: false,
  },
  deactivate: {
    title: "Suspender instituição",
    description: (n) => `"${n}" perderá o acesso até ser reativada.`,
    confirm: "Suspender instituição",
    danger: true,
  },
  cancel: {
    title: "Cancelar instituição",
    description: (n) => `Encerra o contrato de "${n}". A instituição perde o acesso ao painel.`,
    confirm: "Cancelar instituição",
    danger: true,
  },
  "rotate-key": {
    title: "Rotacionar chave de criptografia",
    description: (n) =>
      `Gera uma nova DEK para "${n}" e recifra todos os embeddings faciais. A operação pode levar alguns segundos.`,
    confirm: "Rotacionar chave",
    danger: false,
  },
};

const statusOptions = [
  { value: "trial", label: "Período de teste" },
  { value: "active", label: "Ativa" },
  { value: "suspended", label: "Suspensa" },
  { value: "cancelled", label: "Cancelada" },
];

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const debouncedSearch = useDebounced(search);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [action, setAction] = useState<RowAction | null>(null);

  const list = useQuery({
    queryKey: ["tenants", { page, search: debouncedSearch, status, type }],
    queryFn: () =>
      api.get<Paginated<Tenant>>(
        `/tenants${qs({ page, limit: 20, search: debouncedSearch, status, institutionType: type })}`
      ),
  });

  const plans = useQuery({
    queryKey: ["plans", "options"],
    queryFn: () => api.get<Paginated<Plan>>(`/plans${qs({ limit: 100 })}`),
  });

  const planOptions =
    plans.data?.data.map((p) => ({ value: p.id, label: p.name })) ?? [];

  const createForm = useForm<CreateForm>({ resolver: zodResolver(CreateTenantSchema) });
  const editForm = useForm<UpdateForm>({ resolver: zodResolver(UpdateTenantSchema) });

  const create = useMutation({
    mutationFn: (v: CreateForm) =>
      api.post("/tenants", {
        name: v.name,
        document: v.document || undefined,
        institutionType: v.institutionType,
        planId: v.planId,
        adminUser: { name: v.adminName, email: v.adminEmail },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Instituição criada. As credenciais do administrador foram enviadas por e-mail.");
      setCreating(false);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const update = useMutation({
    mutationFn: (v: UpdateForm) =>
      api.patch(`/tenants/${editing!.id}`, {
        name: v.name,
        document: v.document || undefined,
        institutionType: v.institutionType,
        planId: v.planId || undefined,
        timezone: v.timezone || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Instituição atualizada.");
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const runAction = useMutation({
    mutationFn: async (a: RowAction) => {
      if (a.kind === "rotate-key") {
        return api.post<{ data: RotateDekResult }>(`/tenants/${a.tenant.id}/rotate-key`);
      }
      return api.post(`/tenants/${a.tenant.id}/${a.kind}`);
    },
    onSuccess: (result, a) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      if (a.kind === "rotate-key") {
        const data = (result as { data: RotateDekResult }).data;
        toast.success(
          `Chave rotacionada (versão ${data.keyVersion}). ${data.embeddingsRotated} embeddings recifrados.`
        );
      } else {
        const done: Record<string, string> = {
          activate: "Instituição ativada.",
          deactivate: "Instituição suspensa.",
          cancel: "Instituição cancelada.",
        };
        toast.success(done[a.kind] ?? "Ação concluída.");
      }
      setAction(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    createForm.reset({
      name: "",
      document: "",
      institutionType: "school",
      planId: "",
      adminName: "",
      adminEmail: "",
    });
    setCreating(true);
  };

  const openEdit = (tenant: Tenant) => {
    editForm.reset({
      name: tenant.name,
      document: tenant.document ?? "",
      institutionType: tenant.institutionType,
      planId: "",
      timezone: "",
    });
    setEditing(tenant);
  };

  return (
    <div>
      <PageHeader
        title="Instituições"
        description="Tenants da plataforma: plano, status e chaves de criptografia."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Criar instituição
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nome ou documento"
          icon={<Search size={15} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-72"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os status"
          options={statusOptions}
          className="w-44"
        />
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          placeholder="Todos os tipos"
          options={[
            { value: "school", label: "Escola" },
            { value: "university", label: "Universidade" },
          ]}
          className="w-44"
        />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Instituição</Th>
              <Th>Documento</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Criada em</Th>
              <Th className="w-44 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhuma instituição encontrada."
              emptyDescription="Ajuste os filtros ou crie a primeira instituição."
            />
            {list.data?.data.map((tenant) => (
              <Tr key={tenant.id}>
                <Td className="font-medium text-flauzino-navy-900">{tenant.name}</Td>
                <Td className="font-mono-ds text-xs">{tenant.document ?? "—"}</Td>
                <Td>{tenant.institutionType === "school" ? "Escola" : "Universidade"}</Td>
                <Td><TenantStatusBadge status={tenant.status} /></Td>
                <Td className="font-mono-ds text-xs">{formatDate(tenant.createdAt)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(tenant)} title="Editar" aria-label={`Editar ${tenant.name}`}>
                      <Pencil size={15} />
                    </Button>
                    {tenant.status !== "active" && tenant.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAction({ kind: "activate", tenant })}
                        title="Ativar"
                        aria-label={`Ativar ${tenant.name}`}
                      >
                        <Play size={15} />
                      </Button>
                    )}
                    {tenant.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAction({ kind: "deactivate", tenant })}
                        title="Suspender"
                        aria-label={`Suspender ${tenant.name}`}
                      >
                        <Pause size={15} />
                      </Button>
                    )}
                    {tenant.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAction({ kind: "cancel", tenant })}
                        title="Cancelar contrato"
                        aria-label={`Cancelar ${tenant.name}`}
                      >
                        <XCircle size={15} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAction({ kind: "rotate-key", tenant })}
                      title="Rotacionar chave (DEK)"
                      aria-label={`Rotacionar chave de ${tenant.name}`}
                    >
                      <KeyRound size={15} />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      {/* Criar instituição */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Criar instituição"
        description="O administrador inicial recebe as credenciais por e-mail."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={createForm.handleSubmit((v) => create.mutate(v))} loading={create.isPending}>
              Criar instituição
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={createForm.handleSubmit((v) => create.mutate(v))}
        >
          <Input
            label="Nome da instituição"
            required
            className="sm:col-span-2"
            error={createForm.formState.errors.name?.message}
            {...createForm.register("name")}
          />
          <Input
            label="Documento (CNPJ)"
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            error={createForm.formState.errors.document?.message}
            {...createForm.register("document", {
              onChange: (e) => createForm.setValue("document", maskCnpj(e.target.value)),
            })}
          />
          <Select
            label="Tipo"
            required
            options={[
              { value: "school", label: "Escola" },
              { value: "university", label: "Universidade" },
            ]}
            error={createForm.formState.errors.institutionType?.message}
            {...createForm.register("institutionType")}
          />
          <Select
            label="Plano"
            required
            placeholder="Selecione um plano"
            options={planOptions}
            className="sm:col-span-2"
            error={createForm.formState.errors.planId?.message}
            {...createForm.register("planId")}
          />
          <Input
            label="Nome do administrador"
            required
            error={createForm.formState.errors.adminName?.message}
            {...createForm.register("adminName")}
          />
          <Input
            label="E-mail do administrador"
            type="email"
            required
            error={createForm.formState.errors.adminEmail?.message}
            {...createForm.register("adminEmail")}
          />
        </form>
      </Modal>

      {/* Editar instituição */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Editar instituição"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={editForm.handleSubmit((v) => update.mutate(v))} loading={update.isPending}>
              Salvar alterações
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={editForm.handleSubmit((v) => update.mutate(v))}
        >
          <Input
            label="Nome da instituição"
            required
            className="sm:col-span-2"
            error={editForm.formState.errors.name?.message}
            {...editForm.register("name")}
          />
          <Input
            label="Documento (CNPJ)"
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            error={editForm.formState.errors.document?.message}
            {...editForm.register("document", {
              onChange: (e) => editForm.setValue("document", maskCnpj(e.target.value)),
            })}
          />
          <Select
            label="Tipo"
            required
            options={[
              { value: "school", label: "Escola" },
              { value: "university", label: "Universidade" },
            ]}
            error={editForm.formState.errors.institutionType?.message}
            {...editForm.register("institutionType")}
          />
          <Select
            label="Plano"
            placeholder="Manter plano atual"
            options={planOptions}
            hint="A API não expõe o plano atual — selecione apenas para trocar."
            error={editForm.formState.errors.planId?.message}
            {...editForm.register("planId")}
          />
          <Input
            label="Fuso horário"
            placeholder="America/Sao_Paulo"
            error={editForm.formState.errors.timezone?.message}
            {...editForm.register("timezone")}
          />
        </form>
      </Modal>

      {/* Confirmação de ações */}
      <ConfirmDialog
        open={action !== null}
        onClose={() => setAction(null)}
        onConfirm={() => action && runAction.mutate(action)}
        title={action ? actionCopy[action.kind].title : ""}
        description={action ? actionCopy[action.kind].description(action.tenant.name) : ""}
        confirmLabel={action ? actionCopy[action.kind].confirm : "Confirmar"}
        danger={action ? actionCopy[action.kind].danger : false}
        loading={runAction.isPending}
      />
    </div>
  );
}
