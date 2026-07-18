"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { api, fetchAuthenticatedBlobUrl, qs } from "@/lib/api";
import type { Paginated, RecognitionLog, User } from "@/lib/types";
import { formatDateTime, formatPercent } from "@/lib/format";
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
  Input,
  Select,
  Button,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { RecognitionStatusBadge } from "@/components/app/badges";

const statusOptions = [
  { value: "recognized", label: "Reconhecido" },
  { value: "unknown", label: "Não identificado" },
  { value: "liveness_failed", label: "Falha de vivacidade" },
  { value: "screen_detected", label: "Tela detectada" },
];

/** Modal que busca o fraud frame como blob autenticado. */
function FraudFrameModal({ log, onClose }: { log: RecognitionLog; onClose: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    fetchAuthenticatedBlobUrl(`/audit/frames/${log.id}`)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.id]);

  useEffect(() => {
    if (error) toast.error(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Frame da tentativa de fraude"
      description={`Registrado em ${formatDateTime(log.createdAt)} · retenção limitada conforme a LGPD.`}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex min-h-[240px] items-center justify-center rounded-lg bg-flauzino-slate-100">
        {error ? (
          <p className="px-6 text-center text-sm text-flauzino-danger-600">{error}</p>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Frame capturado na tentativa de fraude"
            className="max-h-[420px] w-auto rounded-lg"
          />
        ) : (
          <Spinner />
        )}
      </div>
    </Modal>
  );
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [viewing, setViewing] = useState<RecognitionLog | null>(null);

  const logs = useQuery({
    queryKey: ["audit-logs", { page, date, status, userId }],
    queryFn: () =>
      api.get<Paginated<RecognitionLog>>(
        `/audit/recognition-logs${qs({ page, limit: 25, date, status, user_id: userId })}`
      ),
  });

  // Filtro por aluno — a lista de usuários é admin-only; para manager o filtro fica oculto
  const students = useQuery({
    queryKey: ["users", "audit-options"],
    queryFn: () => api.get<Paginated<User>>(`/users${qs({ limit: 100 })}`),
    retry: false,
  });

  return (
    <div>
      <PageHeader
        title="Auditoria de reconhecimento"
        description="Todos os eventos de reconhecimento da instituição, incluindo tentativas de fraude."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Data"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          className="w-44"
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          placeholder="Todos"
          options={statusOptions}
          className="w-52"
        />
        {students.isSuccess && (
          <Select
            label="Usuário"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
            placeholder="Todos"
            options={students.data.data.map((s) => ({ value: s.id, label: s.name }))}
            className="w-64"
          />
        )}
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Pessoa</Th>
              <Th>Status</Th>
              <Th>Confiança</Th>
              <Th>Vivacidade</Th>
              <Th>Tempo</Th>
              <Th className="w-32 text-right">Fraude</Th>
            </tr>
          </thead>
          <tbody>
            <TableState
              colSpan={7}
              loading={logs.isPending}
              error={logs.error ? friendlyError(logs.error) : null}
              empty={logs.data?.data.length === 0}
              emptyTitle="Nenhum evento para os filtros selecionados."
            />
            {logs.data?.data.map((log) => (
              <Tr key={log.id}>
                <Td className="font-mono-ds text-xs">{formatDateTime(log.createdAt)}</Td>
                <Td>{log.userName ?? "—"}</Td>
                <Td><RecognitionStatusBadge status={log.status} /></Td>
                <Td className="font-mono-ds text-xs">
                  {log.confidence != null ? formatPercent(log.confidence * 100) : "—"}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {log.livenessScore != null ? log.livenessScore.toFixed(2) : "—"}
                </Td>
                <Td className="font-mono-ds text-xs">
                  {log.processingMs != null ? `${log.processingMs}ms` : "—"}
                </Td>
                <Td>
                  <div className="flex justify-end">
                    {log.fraudFrameExists && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewing(log)}
                        iconLeft={<Eye size={13} />}
                      >
                        Ver frame
                      </Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {logs.data && <Pagination pagination={logs.data.pagination} onPageChange={setPage} />}
      </Card>

      {viewing && <FraudFrameModal log={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
