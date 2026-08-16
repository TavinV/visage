"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { AcademicPeriod, Paginated } from "@/lib/types";
import { formatDateOnly } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
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
  Modal,
  ConfirmDialog,
  Switch,
  useToast,
} from "@/components/ui";
import { ActiveBadge } from "@/components/app/badges";
import { ShowInactiveToggle, inactiveRowClass } from "@/components/app/ShowInactive";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

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
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AcademicPeriod | null>(null);
  const [deleting, setDeleting] = useState<AcademicPeriod | null>(null);

  const list = useQuery({
    queryKey: ["academic-periods", { page, showInactive }],
    queryFn: () =>
      api.get<Paginated<AcademicPeriod>>(
        `/academic-periods${qs({
          page,
          limit: 20,
          isActive: showInactive ? undefined : true,
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
        <ShowInactiveToggle
          checked={showInactive}
          onChange={(next) => {
            setShowInactive(next);
            setPage(1);
          }}
          label="Mostrar inativos"
        />
      </div>

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
            <Input
              label="Início"
              type="date"
              required
              error={form.formState.errors.startsAt?.message}
              {...form.register("startsAt")}
            />
            <Input
              label="Término"
              type="date"
              required
              error={form.formState.errors.endsAt?.message}
              {...form.register("endsAt")}
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
