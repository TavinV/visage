"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Search,
  Copy,
  KeyRound,
  CheckCircle2,
  Clock,
  CircleSlash,
  Fingerprint,
  ShieldCheck,
  ShieldX,
  ShieldOff,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Paginated, StudentIdentification, User } from "@/lib/types";
import { friendlyError } from "@/lib/apiError";
import { useDebounced } from "@/lib/useDebounced";
import { maskCpf } from "@/lib/masks";
import {
  registersCpf,
  registersEnrollmentCode,
  useTenantSettings,
} from "@/lib/identification";
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
  DatePicker,
  Modal,
  FilterButton,
  FilterModal,
  MultiSelect,
  type MultiSelectOption,
  useToast,
} from "@/components/ui";
import { UserStatusBadge, FacialStatusBadge } from "@/components/app/badges";
import { ShowInactiveToggle, inactiveRowClass } from "@/components/app/ShowInactive";
import { UserAvatar } from "@/components/app/UserAvatar";
import { roleOptions, roleLabel } from "@/components/app/labels";
import { RolePicker } from "@/components/app/RolePicker";

const CreateUserSchema = z
  .object({
    name: z.string().min(1, "Informe o nome."),
    email: z.string().email("Informe um e-mail válido.").optional().or(z.literal("")),
    role: z.enum(["admin", "manager", "teacher", "student"], "Selecione o cargo."),
    document: z.string().max(20, "Máximo de 20 caracteres.").optional().or(z.literal("")),
    enrollmentCode: z.string().max(50, "Máximo de 50 caracteres.").optional().or(z.literal("")),
  })
  .refine((v) => v.role === "student" || (v.email && v.email.length > 0), {
    message: "E-mail é obrigatório para quem acessa o painel.",
    path: ["email"],
  });

type CreateUserForm = z.infer<typeof CreateUserSchema>;

/**
 * Os identificadores obrigatórios mudam por instituição (Configurações →
 * Identificação do aluno), então a exigência entra por fora do schema — que é
 * estático — lendo a política vigente no momento do submit.
 */
function buildResolver(
  identification: () => StudentIdentification | undefined
): Resolver<CreateUserForm> {
  const base = zodResolver(CreateUserSchema);
  return async (values, context, options) => {
    const result = await base(values, context, options);
    const errors = { ...result.errors };
    const mode = identification();

    if (values.role === "student") {
      if (registersCpf(mode) && !values.document?.trim()) {
        errors.document = { type: "required", message: "Informe o CPF do aluno." };
      }
      if (registersEnrollmentCode(mode) && !values.enrollmentCode?.trim()) {
        errors.enrollmentCode = { type: "required", message: "Informe a matrícula do aluno." };
      }
    }

    if (Object.keys(errors).length > 0) return { values: {}, errors };
    return result;
  };
}

const roleFilterOptions: MultiSelectOption[] = roleOptions.map((r) => ({
  value: r.value,
  label: r.label,
  icon: r.icon,
}));

const statusFilterOptions: MultiSelectOption[] = [
  { value: "active", label: "Ativo", icon: CheckCircle2 },
  { value: "pending", label: "Pendente", icon: Clock },
];

const facialStatusFilterOptions: MultiSelectOption[] = [
  { value: "none", label: "Sem biometria", icon: CircleSlash },
  { value: "consent_given", label: "Consentiu", icon: ShieldCheck },
  { value: "registered", label: "Biometria ativa", icon: Fingerprint },
  { value: "consent_refused", label: "Recusou", icon: ShieldX },
  { value: "revoked", label: "Revogada", icon: ShieldOff },
];

interface CreatedCredentials {
  name: string;
  email: string;
  temporaryPassword: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [facialStatus, setFacialStatus] = useState<string[]>([]);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const debouncedSearch = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);

  const activeFilterCount =
    [role, status, facialStatus].filter((v) => v.length > 0).length +
    (createdFrom || createdTo ? 1 : 0) +
    (showInactive ? 1 : 0);

  const list = useQuery({
    queryKey: [
      "users",
      { page, search: debouncedSearch, role, status, facialStatus, createdFrom, createdTo, showInactive },
    ],
    queryFn: () =>
      api.get<Paginated<User>>(
        `/users${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          role: role.join(","),
          status: status.join(","),
          facialStatus: facialStatus.join(","),
          created_from: createdFrom,
          created_to: createdTo,
          // Desativar é o "excluir" de usuário: fora da lista até pedirem
          includeInactive: showInactive,
        })}`
      ),
  });

  const settings = useTenantSettings();
  const identification = settings.data?.data.studentIdentification;
  // O resolver é criado uma vez; o ref entrega sempre a política mais recente
  const identificationRef = useRef(identification);
  identificationRef.current = identification;

  const form = useForm<CreateUserForm>({
    resolver: buildResolver(() => identificationRef.current),
  });
  const selectedRole = form.watch("role");
  const isStudent = selectedRole === "student";
  const cpfRegistered = registersCpf(identification);
  const codeRegistered = registersEnrollmentCode(identification);
  // Aluno em instituição que não guarda CPF nem vê o campo; a equipe do
  // painel continua com CPF opcional
  const showDocument = !isStudent || cpfRegistered;

  const create = useMutation({
    mutationFn: (v: CreateUserForm) =>
      api.post<{ data: User & { temporaryPassword?: string } }>("/users", {
        name: v.name,
        email: v.email || undefined,
        role: v.role,
        // Instituição sem CPF de aluno não envia resquício de campo oculto
        document:
          v.role === "student" && !cpfRegistered ? undefined : v.document || undefined,
        enrollmentCode: v.role === "student" ? v.enrollmentCode || undefined : undefined,
      }),
    onSuccess: (res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreating(false);
      if (res.data.temporaryPassword) {
        // Senha gerada pelo backend — exibida uma única vez
        setCredentials({
          name: variables.name,
          email: variables.email ?? "",
          temporaryPassword: res.data.temporaryPassword,
        });
      } else {
        toast.success("Aluno cadastrado.");
      }
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({ name: "", email: "", role: "student", document: "", enrollmentCode: "" });
    setCreating(true);
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Alunos, professores e equipe administrativa da instituição."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Criar usuário
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nome, e-mail, CPF ou matrícula"
          icon={<Search size={15} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-80"
        />
        <FilterButton count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
      </div>

      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onClear={() => {
          setRole([]);
          setStatus([]);
          setFacialStatus([]);
          setCreatedFrom("");
          setCreatedTo("");
          setShowInactive(false);
          setPage(1);
        }}
        activeCount={activeFilterCount}
      >
        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Cadastrado de"
            value={createdFrom}
            onChange={(v) => {
              setCreatedFrom(v);
              setPage(1);
            }}
            max={createdTo || undefined}
            clearable
          />
          <DatePicker
            label="até"
            value={createdTo}
            onChange={(v) => {
              setCreatedTo(v);
              setPage(1);
            }}
            min={createdFrom || undefined}
            clearable
          />
        </div>
        <MultiSelect
          label="Cargo"
          value={role}
          onChange={(vals) => {
            setRole(vals);
            setPage(1);
          }}
          placeholder="Todos os cargos"
          options={roleFilterOptions}
        />
        <MultiSelect
          label="Status"
          value={status}
          onChange={(vals) => {
            setStatus(vals);
            setPage(1);
          }}
          placeholder="Todos os status"
          // "Inativo" sai daqui: quem governa a visibilidade dos desativados é
          // o interruptor ao lado — dois controles para a mesma coisa se
          // contradiziam na tela
          options={statusFilterOptions}
        />
        <MultiSelect
          label="Biometria"
          value={facialStatus}
          onChange={(vals) => {
            setFacialStatus(vals);
            setPage(1);
          }}
          placeholder="Todas"
          options={facialStatusFilterOptions}
        />
        <ShowInactiveToggle
          checked={showInactive}
          onChange={(next) => {
            setShowInactive(next);
            setPage(1);
          }}
          label="Mostrar inativos"
          className="w-full justify-start"
        />
      </FilterModal>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Cargo</Th>
              <Th>Matrícula</Th>
              <Th>Status</Th>
              <Th>Biometria</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhum usuário encontrado."
              emptyDescription="Ajuste os filtros ou crie o primeiro usuário."
            />
            {list.data?.data.map((u) => (
              <Tr key={u.id} className={u.status === "inactive" ? inactiveRowClass : undefined}>
                <Td>
                  <Link href={`/dashboard/users/${u.id}`} className="flex items-center gap-3">
                    <UserAvatar
                      userId={u.id}
                      name={u.name}
                      hasPhoto={u.hasPhoto}
                      photoUpdatedAt={u.photoUpdatedAt}
                    />
                    <span>
                      <b className="block text-[13px] font-semibold text-flauzino-navy-900">
                        {u.name}
                      </b>
                      <span className="text-xs text-flauzino-slate-500">{u.email ?? "—"}</span>
                    </span>
                  </Link>
                </Td>
                <Td>{roleLabel(u.role)}</Td>
                <Td className="font-mono-ds text-xs">{u.enrollmentCode ?? "—"}</Td>
                <Td><UserStatusBadge status={u.status} /></Td>
                <Td><FacialStatusBadge status={u.facialStatus} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Criar usuário"
        description="Quem acessa o painel recebe uma senha temporária gerada automaticamente."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => create.mutate(v))} loading={create.isPending}>
              Criar usuário
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nome completo"
              required
              className="sm:col-span-2"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />
            <Input
              label="E-mail"
              type="email"
              required={!isStudent}
              hint={isStudent ? "Opcional para alunos." : "As credenciais serão vinculadas a este e-mail."}
              error={form.formState.errors.email?.message}
              {...form.register("email")}
            />
            {showDocument && (
              <Input
                label="Documento (CPF)"
                placeholder="000.000.000-00"
                inputMode="numeric"
                required={isStudent && cpfRegistered}
                hint={isStudent ? "Identifica o aluno no cadastro biométrico." : undefined}
                error={form.formState.errors.document?.message}
                {...form.register("document", {
                  onChange: (e) => form.setValue("document", maskCpf(e.target.value)),
                })}
              />
            )}
            {isStudent && (
              <Input
                label="Código de matrícula"
                className={showDocument ? "sm:col-span-2" : undefined}
                required={codeRegistered}
                hint="Usado para vincular o aluno às turmas e relatórios."
                error={form.formState.errors.enrollmentCode?.message}
                {...form.register("enrollmentCode")}
              />
            )}
          </div>
          {!isStudent && (
            <p className="rounded-lg bg-flauzino-accent-50 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-700">
              A senha inicial é gerada automaticamente e exibida uma única vez após a
              criação. O usuário é obrigado a trocá-la no primeiro acesso.
            </p>
          )}
        </form>
      </Modal>

      {/* Credenciais temporárias — exibidas uma única vez */}
      <Modal
        open={credentials !== null}
        onClose={() => setCredentials(null)}
        title="Usuário criado"
        description="Entregue estas credenciais por um canal seguro. A senha não será exibida novamente."
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setCredentials(null)}>
            Concluir
          </Button>
        }
      >
        {credentials && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-flauzino-slate-100 px-4 py-3">
              <p className="text-xs font-medium text-flauzino-slate-500">E-mail de acesso</p>
              <p className="mt-0.5 font-mono-ds text-sm text-flauzino-navy-900">{credentials.email}</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-flauzino-slate-100 px-4 py-3">
              <span className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-flauzino-slate-500">
                  <KeyRound size={12} /> Senha temporária
                </p>
                <code className="mt-0.5 block truncate font-mono-ds text-base font-semibold text-flauzino-navy-900">
                  {credentials.temporaryPassword}
                </code>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(credentials.temporaryPassword)
                    .then(() => toast.success("Senha copiada."))
                }
                iconLeft={<Copy size={14} />}
              >
                Copiar
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-flauzino-slate-500">
              No primeiro acesso, {credentials.name.split(" ")[0]} será direcionado a
              definir uma senha própria.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
