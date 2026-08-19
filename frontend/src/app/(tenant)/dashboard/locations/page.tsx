"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Location, Paginated } from "@/lib/types";
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
  Textarea,
  DatePicker,
  Select,
  Modal,
  ConfirmDialog,
  Switch,
  FilterButton,
  FilterModal,
  useToast,
} from "@/components/ui";

const tristateOptions = (yes: string, no: string) => [
  { value: "true", label: yes },
  { value: "false", label: no },
];
import { ActiveBadge } from "@/components/app/badges";
import { ShowInactiveToggle, inactiveRowClass } from "@/components/app/ShowInactive";

const LocationSchema = z.object({
  name: z.string().min(1, "Informe o nome."),
  address: z.string().max(300, "Máximo de 300 caracteres.").optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

type LocationForm = z.infer<typeof LocationSchema>;

export default function LocationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [hasAddress, setHasAddress] = useState("");
  const [hasDevice, setHasDevice] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const debouncedSearch = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);

  const activeFilterCount =
    (showInactive ? 1 : 0) +
    (hasAddress ? 1 : 0) +
    (hasDevice ? 1 : 0) +
    (createdFrom || createdTo ? 1 : 0);

  const list = useQuery({
    queryKey: [
      "locations",
      { page, search: debouncedSearch, showInactive, hasAddress, hasDevice, createdFrom, createdTo },
    ],
    queryFn: () =>
      api.get<Paginated<Location>>(
        `/locations${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          isActive: showInactive ? undefined : true,
          hasAddress,
          hasDevice,
          created_from: createdFrom,
          created_to: createdTo,
        })}`
      ),
  });

  const form = useForm<LocationForm>({ resolver: zodResolver(LocationSchema) });

  const save = useMutation({
    mutationFn: (v: LocationForm) => {
      const body = { name: v.name, address: v.address || undefined };
      return editing
        ? api.patch(`/locations/${editing.id}`, { ...body, isActive: v.isActive })
        : api.post("/locations", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success(editing ? "Sala de aula atualizada." : "Sala de aula criada.");
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (loc: Location) => api.delete(`/locations/${loc.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Sala de aula excluída.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({ name: "", address: "", isActive: true });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (loc: Location) => {
    form.reset({ name: loc.name, address: loc.address ?? "", isActive: loc.isActive });
    setCreating(false);
    setEditing(loc);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Salas de aula"
        description="Salas e ambientes onde os totens registram presença."
        actions={
          !isTeacher && (
            <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
              Criar sala de aula
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por nome"
          icon={<Search size={15} />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-72"
        />
        <FilterButton count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
      </div>

      <FilterModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onClear={() => {
          setShowInactive(false);
          setHasAddress("");
          setHasDevice("");
          setCreatedFrom("");
          setCreatedTo("");
          setPage(1);
        }}
        activeCount={activeFilterCount}
      >
        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Cadastrada de"
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
        <Select
          label="Endereço"
          value={hasAddress}
          onChange={(e) => {
            setHasAddress(e.target.value);
            setPage(1);
          }}
          placeholder="Todas"
          options={tristateOptions("Com endereço cadastrado", "Sem endereço cadastrado")}
        />
        <Select
          label="Totem vinculado"
          value={hasDevice}
          onChange={(e) => {
            setHasDevice(e.target.value);
            setPage(1);
          }}
          placeholder="Todas"
          options={tristateOptions("Com totem vinculado", "Sem totem vinculado")}
        />
        <ShowInactiveToggle
          checked={showInactive}
          onChange={(next) => {
            setShowInactive(next);
            setPage(1);
          }}
          label="Mostrar inativas"
          className="w-full justify-start"
        />
      </FilterModal>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Endereço</Th>
              <Th>Status</Th>
              <Th>Criada em</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={5}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle={
                showInactive
                  ? "Nenhuma sala de aula cadastrada."
                  : "Nenhuma sala de aula ativa."
              }
              emptyDescription={
                showInactive
                  ? undefined
                  : "Crie uma sala ou marque “Mostrar inativas” para ver as desativadas."
              }
            />
            {list.data?.data.map((loc) => (
              <Tr key={loc.id} className={loc.isActive ? undefined : inactiveRowClass}>
                <Td className="font-medium text-flauzino-navy-900">{loc.name}</Td>
                <Td>{loc.address ?? "—"}</Td>
                <Td><ActiveBadge active={loc.isActive} /></Td>
                <Td className="font-mono-ds text-xs">{formatDate(loc.createdAt)}</Td>
                <Td>
                  {!isTeacher && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(loc)} aria-label={`Editar ${loc.name}`}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(loc)} aria-label={`Excluir ${loc.name}`}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination pagination={list.data.pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={editing ? "Editar sala de aula" : "Criar sala de aula"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              {editing ? "Salvar alterações" : "Criar sala de aula"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Input
            label="Nome"
            required
            placeholder="Sala 12 — Bloco B"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Textarea
            label="Endereço"
            placeholder="Endereço ou referência do ambiente"
            error={form.formState.errors.address?.message}
            {...form.register("address")}
          />
          {editing && <Switch label="Sala de aula ativa" {...form.register("isActive")} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir sala de aula"
        description={`"${deleting?.name}" será removida. Dispositivos vinculados a ela ficarão sem sala.`}
        confirmLabel="Excluir sala de aula"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
