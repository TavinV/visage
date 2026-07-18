"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Paginated, Plan } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
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

const PlanSchema = z.object({
  name: z.string().min(2, "Informe o nome do plano."),
  maxClasses: z
    .number("Informe um número.")
    .int("Use um número inteiro.")
    .positive("Deve ser maior que zero."),
  priceMonthly: z.number("Informe um valor.").nonnegative("Não pode ser negativo."),
  isActive: z.boolean().optional(),
});

type PlanForm = z.infer<typeof PlanSchema>;

export default function PlansPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const list = useQuery({
    queryKey: ["plans", { all: true, page }],
    queryFn: () => api.get<Paginated<Plan>>(`/plans${qs({ all: true, page, limit: 20 })}`),
  });

  const form = useForm<PlanForm>({ resolver: zodResolver(PlanSchema) });

  const openCreate = () => {
    form.reset({ name: "", maxClasses: 5, priceMonthly: 0, isActive: true });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (plan: Plan) => {
    form.reset({
      name: plan.name,
      maxClasses: plan.maxClasses,
      priceMonthly: Number(plan.priceMonthly),
      isActive: plan.isActive,
    });
    setCreating(false);
    setEditing(plan);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const save = useMutation({
    mutationFn: async (values: PlanForm) => {
      if (editing) {
        return api.patch(`/plans/${editing.id}`, values);
      }
      const { isActive: _ignored, ...createBody } = values;
      return api.post("/plans", createBody);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success(editing ? "Plano atualizado." : "Plano criado.");
      close();
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (plan: Plan) => api.delete(`/plans/${plan.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plano desativado.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const modalOpen = creating || editing !== null;

  return (
    <div>
      <PageHeader
        title="Planos de assinatura"
        description="Limites e preço mensal de cada plano oferecido às instituições."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Criar plano
          </Button>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Turmas incluídas</Th>
              <Th>Mensalidade</Th>
              <Th>Status</Th>
              <Th>Criado em</Th>
              <Th className="w-24 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={6}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle="Nenhum plano cadastrado."
              emptyDescription="Crie o primeiro plano para liberar a criação de instituições."
            />
            {list.data?.data.map((plan) => (
              <Tr key={plan.id}>
                <Td className="font-medium text-flauzino-navy-900">{plan.name}</Td>
                <Td className="font-mono-ds">{plan.maxClasses}</Td>
                <Td className="font-mono-ds">{formatCurrency(plan.priceMonthly)}</Td>
                <Td><ActiveBadge active={plan.isActive} /></Td>
                <Td className="font-mono-ds text-xs">{formatDate(plan.createdAt)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} aria-label={`Editar ${plan.name}`}>
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(plan)}
                      disabled={!plan.isActive}
                      aria-label={`Desativar ${plan.name}`}
                    >
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
        open={modalOpen}
        onClose={close}
        title={editing ? "Editar plano" : "Criar plano"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button
              onClick={form.handleSubmit((v) => save.mutate(v))}
              loading={save.isPending}
            >
              {editing ? "Salvar alterações" : "Criar plano"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Input label="Nome" required error={form.formState.errors.name?.message} {...form.register("name")} />
          <Input
            label="Turmas incluídas"
            type="number"
            min={1}
            required
            error={form.formState.errors.maxClasses?.message}
            {...form.register("maxClasses", { valueAsNumber: true })}
          />
          <Input
            label="Mensalidade (R$)"
            type="number"
            step="0.01"
            min={0}
            required
            error={form.formState.errors.priceMonthly?.message}
            {...form.register("priceMonthly", { valueAsNumber: true })}
          />
          {editing && <Switch label="Plano ativo" {...form.register("isActive")} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Desativar plano"
        description={`O plano "${deleting?.name}" deixará de ser oferecido a novas instituições. Instituições existentes não são afetadas.`}
        confirmLabel="Desativar plano"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
