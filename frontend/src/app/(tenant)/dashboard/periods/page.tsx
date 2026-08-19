"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, CircleDot, Archive, CalendarClock } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { AcademicPeriod, Paginated } from "@/lib/types";
import { formatDateOnly } from "@/lib/format";
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
  DatePicker,
  Modal,
  ConfirmDialog,
  Switch,
  FilterButton,
  FilterModal,
  MultiSelect,
  type MultiSelectOption,
  useToast,
} from "@/components/ui";
import { ActiveBadge } from "@/components/app/badges";
import { ShowInactiveToggle, inactiveRowClass } from "@/components/app/ShowInactive";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const temporalOptions: MultiSelectOption[] = [
  { value: "current", label: "Vigente agora", icon: CircleDot },
  { value: "future", label: "Ainda não começou", icon: CalendarClock },
  { value: "past", label: "Encerrado", icon: Archive },
];

const PeriodSchema = z
  .object({
    name: z.string().min(1, "Informe o nome."),
    startsAt: z.string().regex(dateRegex, "Informe a data de início."),
    endsAt: z.string().regex(dateRegex, "Informe a data de término."),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.startsAt <= v.endsAt, {
    message: "O término deve ser depois do início.",
    path: ["endsAt"],
  });

type PeriodForm = z.infer<typeof PeriodSchema>;

export default function PeriodsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [temporal, setTemporal] = useState<string[]>([]);
  const [startsFrom, setStartsFrom] = useState("");
  const [startsTo, setStartsTo] = useState("");
  const [endsFrom, setEndsFrom] = useState("");
  const [endsTo, setEndsTo] = useState("");
  const debouncedSearch = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcademicPeriod | null>(null);
  const [deleting, setDeleting] = useState<AcademicPeriod | null>(null);

  const activeFilterCount =
    (showInactive ? 1 : 0) +
    (temporal.length > 0 ? 1 : 0) +
    (startsFrom || startsTo ? 1 : 0) +
    (endsFrom || endsTo ? 1 : 0);

  const list = useQuery({
    queryKey: [
      "academic-periods",
      { page, search: debouncedSearch, showInactive, temporal, startsFrom, startsTo, endsFrom, endsTo },
    ],
    queryFn: () =>
      api.get<Paginated<AcademicPeriod>>(
        `/academic-periods${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          isActive: showInactive ? undefined : true,
          temporal: temporal.join(","),
          starts_from: startsFrom,
          starts_to: startsTo,
          ends_from: endsFrom,
          ends_to: endsTo,
        })}`
      ),
  });

  const form = useForm<PeriodForm>({ resolver: zodResolver(PeriodSchema) });

  const save = useMutation({
    mutationFn: (v: PeriodForm) => {
      const body = { name: v.name, startsAt: v.startsAt, endsAt: v.endsAt };
      return editing
        ? api.patch(`/academic-periods/${editing.id}`, { ...body, isActive: v.isActive })
        : api.post("/academic-periods", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-periods"] });
      toast.success(editing ? "Período atualizado." : "Período criado.");
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (p: AcademicPeriod) => api.delete(`/academic-periods/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-periods"] });
      toast.success("Período excluído.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({ name: "", startsAt: "", endsAt: "", isActive: true });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (p: AcademicPeriod) => {
    form.reset({
      name: p.name,
      startsAt: p.startsAt.slice(0, 10),
      endsAt: p.endsAt.slice(0, 10),
      isActive: p.isActive,
    });
    setCreating(false);
    setEditing(p);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Períodos acadêmicos"
        description="Semestres ou bimestres que organizam cursos e turmas."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Criar período
          </Button>
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
          setTemporal([]);
          setStartsFrom("");
          setStartsTo("");
          setEndsFrom("");
          setEndsTo("");
          setPage(1);
        }}
        activeCount={activeFilterCount}
      >
        <MultiSelect
          label="Situação"
          value={temporal}
          onChange={(vals) => {
            setTemporal(vals);
            setPage(1);
          }}
          placeholder="Todas"
          options={temporalOptions}
        />
        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Início de"
            value={startsFrom}
            onChange={(v) => {
              setStartsFrom(v);
              setPage(1);
            }}
            max={startsTo || undefined}
            clearable
          />
          <DatePicker
            label="até"
            value={startsTo}
            onChange={(v) => {
              setStartsTo(v);
              setPage(1);
            }}
            min={startsFrom || undefined}
            clearable
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Término de"
            value={endsFrom}
            onChange={(v) => {
              setEndsFrom(v);
              setPage(1);
            }}
            max={endsTo || undefined}
            clearable
          />
          <DatePicker
            label="até"
            value={endsTo}
            onChange={(v) => {
              setEndsTo(v);
              setPage(1);
            }}
            min={endsFrom || undefined}
            clearable
          />
        </div>
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
              <Th>Nome</Th>
              <Th>Início</Th>
              <Th>Término</Th>
              <Th>Status</Th>
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
                showInactive ? "Nenhum período cadastrado." : "Nenhum período ativo."
              }
              emptyDescription={
                showInactive
                  ? "Crie um período para poder cadastrar cursos e turmas."
                  : "Crie um período ou marque “Mostrar inativos” para ver os encerrados."
              }
            />
            {list.data?.data.map((p) => (
              <Tr key={p.id} className={p.isActive ? undefined : inactiveRowClass}>
                <Td className="font-medium text-flauzino-navy-900">{p.name}</Td>
                <Td className="font-mono-ds text-xs">{formatDateOnly(p.startsAt)}</Td>
                <Td className="font-mono-ds text-xs">{formatDateOnly(p.endsAt)}</Td>
                <Td><ActiveBadge active={p.isActive} /></Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label={`Excluir ${p.name}`}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
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
        title={editing ? "Editar período" : "Criar período"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              {editing ? "Salvar alterações" : "Criar período"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Input
            label="Nome"
            required
            placeholder="2026.2"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <DatePicker
                  label="Início"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={form.formState.errors.startsAt?.message}
                />
              )}
            />
            <Controller
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <DatePicker
                  label="Término"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={form.formState.errors.endsAt?.message}
                />
              )}
            />
          </div>
          {editing && <Switch label="Período ativo" {...form.register("isActive")} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir período"
        description={`"${deleting?.name}" será removido. Cursos vinculados a ele podem ficar órfãos.`}
        confirmLabel="Excluir período"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
