"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Copy,
  AlertTriangle,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Device, Location, Paginated } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
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
  DatePicker,
  Modal,
  ConfirmDialog,
  Switch,
  Badge,
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
import { DeviceCalibrationModal } from "@/components/app/DeviceCalibrationModal";

const DeviceSchema = z.object({
  deviceFingerprint: z.string().min(1, "Informe o identificador do dispositivo."),
  label: z.string().max(100, "Máximo de 100 caracteres.").optional().or(z.literal("")),
  locationId: z.string().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  allowEnrollment: z.boolean().optional(),
});

type DeviceForm = z.infer<typeof DeviceSchema>;

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [allowEnrollment, setAllowEnrollment] = useState("");
  const [lastSeenFrom, setLastSeenFrom] = useState("");
  const [lastSeenTo, setLastSeenTo] = useState("");
  const debouncedSearch = useDebounced(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [regenerating, setRegenerating] = useState<Device | null>(null);
  const [calibrating, setCalibrating] = useState<Device | null>(null);
  const [createdKey, setCreatedKey] = useState<{ label: string; apiKey: string } | null>(null);

  const activeFilterCount =
    (showInactive ? 1 : 0) +
    (locationFilter ? 1 : 0) +
    (allowEnrollment ? 1 : 0) +
    (lastSeenFrom || lastSeenTo ? 1 : 0);

  const list = useQuery({
    queryKey: [
      "devices",
      { page, search: debouncedSearch, showInactive, locationFilter, allowEnrollment, lastSeenFrom, lastSeenTo },
    ],
    queryFn: () =>
      api.get<Paginated<Device>>(
        `/devices${qs({
          page,
          limit: 20,
          search: debouncedSearch,
          // Sem o filtro, um totem desativado continua disputando a lista
          isActive: showInactive ? undefined : true,
          locationId: locationFilter,
          allowEnrollment,
          last_seen_from: lastSeenFrom,
          last_seen_to: lastSeenTo,
        })}`
      ),
  });

  const locations = useQuery({
    queryKey: ["locations", "options"],
    queryFn: () => api.get<Paginated<Location>>(`/locations${qs({ limit: 100 })}`),
  });

  // Sala inativa não é oferecida em vínculo novo, mas continua no mapa: o
  // totem já vinculado a ela precisa mostrar o nome, não um traço
  const locationOptions =
    locations.data?.data.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })) ??
    [];
  const locationNameById = new Map(locations.data?.data.map((l) => [l.id, l.name]) ?? []);

  const form = useForm<DeviceForm>({ resolver: zodResolver(DeviceSchema) });

  const save = useMutation({
    mutationFn: async (v: DeviceForm) => {
      if (editing) {
        return api.patch<{ data: Device }>(`/devices/${editing.id}`, {
          label: v.label || undefined,
          locationId: v.locationId || undefined,
          isActive: v.isActive,
          allowEnrollment: v.allowEnrollment,
        });
      }
      return api.post<{ data: Device }>("/devices", {
        deviceFingerprint: v.deviceFingerprint,
        label: v.label || undefined,
        locationId: v.locationId || undefined,
        allowEnrollment: v.allowEnrollment ?? false,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      if (editing) {
        toast.success("Dispositivo atualizado.");
      } else {
        const device = res.data;
        if (device.apiKey) {
          setCreatedKey({ label: device.label ?? device.deviceFingerprint, apiKey: device.apiKey });
        } else {
          toast.success("Dispositivo criado.");
        }
      }
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: (d: Device) => api.delete(`/devices/${d.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Dispositivo excluído.");
      setDeleting(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const regenerateKey = useMutation({
    mutationFn: (d: Device) => api.post<{ data: Device }>(`/devices/${d.id}/regenerate-key`),
    onSuccess: (res, d) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      const device = res.data;
      setCreatedKey({ label: d.label ?? d.deviceFingerprint, apiKey: device.apiKey! });
      setRegenerating(null);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const openCreate = () => {
    form.reset({ deviceFingerprint: "", label: "", locationId: "", isActive: true, allowEnrollment: false });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (d: Device) => {
    form.reset({
      deviceFingerprint: d.deviceFingerprint,
      label: d.label ?? "",
      locationId: d.locationId ?? "",
      isActive: d.isActive,
      allowEnrollment: d.allowEnrollment,
    });
    setCreating(false);
    setEditing(d);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Dispositivos"
        description="Totens autorizados a registrar presença. Qualquer tablet ou celular pode virar um totem."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus size={16} />}>
            Registrar dispositivo
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar por rótulo ou identificador"
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
          setShowInactive(false);
          setLocationFilter("");
          setAllowEnrollment("");
          setLastSeenFrom("");
          setLastSeenTo("");
          setPage(1);
        }}
        activeCount={activeFilterCount}
      >
        <Select
          label="Sala vinculada"
          value={locationFilter}
          onChange={(e) => {
            setLocationFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Todas as salas"
          options={locationOptions}
        />
        <Select
          label="Cadastro biométrico"
          value={allowEnrollment}
          onChange={(e) => {
            setAllowEnrollment(e.target.value);
            setPage(1);
          }}
          placeholder="Todos"
          options={tristateOptions("Permite cadastro", "Não permite cadastro")}
        />
        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Visto de"
            value={lastSeenFrom}
            onChange={(v) => {
              setLastSeenFrom(v);
              setPage(1);
            }}
            max={lastSeenTo || undefined}
            clearable
          />
          <DatePicker
            label="até"
            value={lastSeenTo}
            onChange={(v) => {
              setLastSeenTo(v);
              setPage(1);
            }}
            min={lastSeenFrom || undefined}
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
              <Th>Rótulo</Th>
              <Th>Identificador</Th>
              <Th>Sala de aula</Th>
              <Th>Cadastro</Th>
              <Th>Calibração</Th>
              <Th>Status</Th>
              <Th>Visto por último</Th>
              <Th className="w-32 text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={8}
              loading={list.isPending}
              error={list.error ? friendlyError(list.error) : null}
              empty={list.data?.data.length === 0}
              emptyTitle={
                showInactive ? "Nenhum dispositivo registrado." : "Nenhum dispositivo ativo."
              }
              emptyDescription={
                showInactive
                  ? "Registre o primeiro totem para começar a reconhecer presenças."
                  : "Registre um totem ou marque “Mostrar inativos” para ver os desativados."
              }
            />
            {list.data?.data.map((d) => (
              <Tr key={d.id} className={d.isActive ? undefined : inactiveRowClass}>
                <Td className="font-medium text-flauzino-navy-900">{d.label ?? "—"}</Td>
                <Td className="font-mono-ds text-xs">{d.deviceFingerprint}</Td>
                <Td>{d.locationId ? locationNameById.get(d.locationId) ?? "—" : "—"}</Td>
                <Td>
                  {d.allowEnrollment ? (
                    <Badge variant="accent" dot>Liberado</Badge>
                  ) : (
                    <Badge variant="neutral">Bloqueado</Badge>
                  )}
                </Td>
                <Td>
                  {d.calibration?.isCalibrated ? (
                    <span className="flex flex-col">
                      <Badge variant="accent" dot className="w-fit">
                        Própria
                      </Badge>
                      <span className="mt-0.5 font-mono-ds text-[11px] text-flauzino-slate-500">
                        reconhec. {d.calibration.effectiveRecognitionThreshold.toFixed(2)} · vivacidade{" "}
                        {d.calibration.effectiveLivenessThreshold.toFixed(2)}
                      </span>
                    </span>
                  ) : (
                    <Badge variant="neutral">Herdada</Badge>
                  )}
                </Td>
                <Td><ActiveBadge active={d.isActive} /></Td>
                <Td className="font-mono-ds text-xs">{formatDateTime(d.lastSeenAt)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalibrating(d)}
                      aria-label={`Calibração de ${d.label ?? d.deviceFingerprint}`}
                      title="Calibração do totem"
                    >
                      <SlidersHorizontal size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)} aria-label={`Editar ${d.label ?? d.deviceFingerprint}`}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRegenerating(d)} aria-label={`Regenerar chave de acesso de ${d.label ?? d.deviceFingerprint}`}>
                      <KeyRound size={15} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(d)} aria-label={`Excluir ${d.label ?? d.deviceFingerprint}`}>
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
        title={editing ? "Editar dispositivo" : "Registrar dispositivo"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={form.handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
              {editing ? "Salvar alterações" : "Registrar dispositivo"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Input
            label="Identificador do dispositivo"
            required
            disabled={editing !== null}
            placeholder="totem-recepcao-01"
            hint={
              editing
                ? "O identificador não pode ser alterado."
                : "Um nome único para reconhecer este aparelho — ex.: totem-recepcao-01."
            }
            error={form.formState.errors.deviceFingerprint?.message}
            {...form.register("deviceFingerprint")}
          />
          <Input
            label="Rótulo"
            placeholder="Totem da recepção"
            error={form.formState.errors.label?.message}
            {...form.register("label")}
          />
          <Select
            label="Sala de aula"
            placeholder="Sem sala vinculada"
            options={locationOptions}
            error={form.formState.errors.locationId?.message}
            {...form.register("locationId")}
          />
          <Switch
            label="Permitir cadastro biométrico"
            hint="Exibe o botão de cadastro por CPF na tela deste totem."
            {...form.register("allowEnrollment")}
          />
          {editing && <Switch label="Dispositivo ativo" {...form.register("isActive")} />}
        </form>
      </Modal>

      {/* API key exibida uma única vez após o registro ou regeneração */}
      <Modal
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title="Chave de acesso gerada"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setCreatedKey(null)}>
            Concluir
          </Button>
        }
      >
        {createdKey && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-flauzino-warning-600/30 bg-flauzino-warning-100 px-4 py-3">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-flauzino-warning-600" />
              <p className="text-sm text-flauzino-slate-700">
                Esta é a única vez que a chave de acesso de{" "}
                <b className="font-semibold">{createdKey.label}</b> será exibida.
                Copie e guarde em local seguro — é ela que autoriza o totem a se conectar.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-flauzino-slate-100 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono-ds text-xs text-flauzino-navy-900">
                {createdKey.apiKey}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(createdKey.apiKey)
                    .then(() => toast.success("Chave copiada."))
                }
                iconLeft={<Copy size={14} />}
              >
                Copiar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title="Excluir dispositivo"
        description={`"${deleting?.label ?? deleting?.deviceFingerprint}" perderá o acesso imediatamente. A chave dele deixa de funcionar.`}
        confirmLabel="Excluir dispositivo"
        danger
        loading={remove.isPending}
      />

      <ConfirmDialog
        open={regenerating !== null}
        onClose={() => setRegenerating(null)}
        onConfirm={() => regenerating && regenerateKey.mutate(regenerating)}
        title="Regenerar chave de acesso"
        description={`A chave atual de "${regenerating?.label ?? regenerating?.deviceFingerprint}" será invalidada imediatamente. Use isso se o totem perdeu a chave (ex.: após logout ou reset do aparelho) — será preciso configurar a nova chave no dispositivo antes que ele volte a funcionar.`}
        confirmLabel="Regenerar chave"
        danger
        loading={regenerateKey.isPending}
      />

      {calibrating && (
        <DeviceCalibrationModal device={calibrating} onClose={() => setCalibrating(null)} />
      )}
    </div>
  );
}
