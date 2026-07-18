"use client";

import { useEffect, useRef, useState } from "react";
import { ScanFace, ClipboardCheck, ShieldAlert, QrCode, MonitorSmartphone, Activity } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";
import type { TenantSettings } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { friendlyError } from "@/lib/apiError";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Switch,
  Skeleton,
  useToast,
} from "@/components/ui";
import { CalibrationModal } from "@/components/app/CalibrationModal";

// O backend não impõe teto — o limiar de reconhecimento pode passar de 1
// (escala de distância, ex.: 1.1 com thresholds dinâmicos).
const threshold = (label: string) => z.number(`Informe ${label}.`).min(0, "Mínimo 0.");

const SettingsSchema = z.object({
  recognitionThreshold: threshold("o limiar de reconhecimento"),
  livenessEnabled: z.boolean(),
  livenessThreshold: threshold("o limiar de vivacidade"),
  staticPixelThreshold: z.number("Informe o limiar.").min(0, "Mínimo 0."),
  allowManualOverride: z.boolean(),
  preAttendanceEnabled: z.boolean(),
  preAttendanceWindowMin: z
    .number("Informe os minutos.")
    .int("Use um número inteiro.")
    .min(0, "Mínimo 0."),
  individualCheckoutEnabled: z.boolean(),
  saveFraudFrames: z.boolean(),
  fraudRetentionHours: z
    .number("Informe as horas.")
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1 hora."),
  requireConsentBeforeFacial: z.boolean(),
  enrollmentTokenExpiryHours: z
    .number("Informe as horas.")
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1 hora."),
  enrollmentMultiFrameCount: z
    .number("Informe a quantidade.")
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1 frame."),
  livenessThresholdEnrollment: threshold("o limiar de vivacidade do cadastro"),
  totemPanelPassword: z.string().max(200, "Máximo de 200 caracteres.").optional().or(z.literal("")),
  totemClockTimezone: z.string(),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

const asNumber = {
  setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [calibrating, setCalibrating] = useState(false);

  const settings = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: () => api.get<{ data: TenantSettings }>("/tenant-settings"),
  });

  const form = useForm<SettingsForm>({ resolver: zodResolver(SettingsSchema) });
  const initialized = useRef(false);

  useEffect(() => {
    const s = settings.data?.data;
    if (!s) return;
    // Popula o formulário só na primeira carga — refetches (ex.: focus da
    // janela) não podem descartar edições nem erros de validação em curso.
    if (initialized.current) return;
    initialized.current = true;
    form.reset({
      recognitionThreshold: s.recognitionThreshold,
      livenessEnabled: s.livenessEnabled,
      livenessThreshold: s.livenessThreshold,
      staticPixelThreshold: s.staticPixelThreshold,
      allowManualOverride: s.allowManualOverride,
      preAttendanceEnabled: s.preAttendanceEnabled,
      preAttendanceWindowMin: s.preAttendanceWindowMin,
      individualCheckoutEnabled: s.individualCheckoutEnabled,
      saveFraudFrames: s.saveFraudFrames,
      fraudRetentionHours: s.fraudRetentionHours,
      requireConsentBeforeFacial: s.requireConsentBeforeFacial,
      enrollmentTokenExpiryHours: s.enrollmentTokenExpiryHours,
      enrollmentMultiFrameCount: s.enrollmentMultiFrameCount,
      livenessThresholdEnrollment: s.livenessThresholdEnrollment,
      totemPanelPassword: s.totemPanelPassword ?? "",
      totemClockTimezone: s.totemClockTimezone ?? "local",
    });
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: (v: SettingsForm) =>
      api.patch("/tenant-settings", {
        ...v,
        // Campo vazio desativa a senha do painel do totem
        totemPanelPassword: v.totemPanelPassword?.trim() ? v.totemPanelPassword.trim() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      toast.success("Configurações salvas.");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  if (settings.isPending) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <PageHeader title="Configurações" description={friendlyError(settings.error)} />
    );
  }

  const errors = form.formState.errors;

  // Modal de calibração vive fora do <form> para não disparar submit
  return (
    <>
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="mx-auto max-w-5xl">
      <PageHeader
        title="Configurações da instituição"
        description={`Limiar de reconhecimento, vivacidade e políticas de privacidade. Atualizado em ${formatDateTime(settings.data.data.updatedAt)}.`}
        actions={
          <Button type="submit" loading={save.isPending}>
            Salvar configurações
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Reconhecimento"
            description="Sensibilidade do matching facial e das defesas anti-spoofing."
            icon={<ScanFace size={18} strokeWidth={1.75} />}
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCalibrating(true)}
                iconLeft={<Activity size={14} />}
              >
                Calibrar pelo totem
              </Button>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <Input
              label="Limiar de reconhecimento"
              type="number"
              step="0.01"
              min={0}
              hint="Limiar de similaridade do matching — valores maiores são mais rígidos."
              error={errors.recognitionThreshold?.message}
              {...form.register("recognitionThreshold", asNumber)}
            />
            <Switch
              label="Verificação de vivacidade ativada"
              hint="Bloqueia fotos e máscaras confirmando que há uma pessoa real diante da câmera."
              {...form.register("livenessEnabled")}
            />
            <Input
              label="Limiar de vivacidade"
              type="number"
              step="0.01"
              min={0}
              error={errors.livenessThreshold?.message}
              {...form.register("livenessThreshold", asNumber)}
            />
            <Input
              label="Limiar de variação de pixels"
              type="number"
              step="0.1"
              min={0}
              hint="Diferença mínima entre frames para descartar imagens estáticas."
              error={errors.staticPixelThreshold?.message}
              {...form.register("staticPixelThreshold", asNumber)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Presença"
            description="Comportamento da chamada e ajustes manuais."
            icon={<ClipboardCheck size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <Switch
              label="Permitir ajuste manual"
              hint="Professores podem corrigir presenças após a chamada."
              {...form.register("allowManualOverride")}
            />
            <Switch
              label="Pré-presença"
              hint="Alunos podem registrar presença antes do início da aula."
              {...form.register("preAttendanceEnabled")}
            />
            <Input
              label="Janela de pré-presença (minutos)"
              type="number"
              min={0}
              error={errors.preAttendanceWindowMin?.message}
              {...form.register("preAttendanceWindowMin", asNumber)}
            />
            <Switch
              label="Checkout individual"
              hint="Alunos registram a saída individualmente no totem."
              {...form.register("individualCheckoutEnabled")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Fraude e privacidade"
            description="Retenção de evidências conforme a LGPD."
            icon={<ShieldAlert size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <Switch
              label="Salvar frames de fraude"
              hint="Tentativas bloqueadas ficam disponíveis na auditoria."
              {...form.register("saveFraudFrames")}
            />
            <Input
              label="Retenção dos frames (horas)"
              type="number"
              min={1}
              hint="Após o prazo, os frames são apagados automaticamente."
              error={errors.fraudRetentionHours?.message}
              {...form.register("fraudRetentionHours", asNumber)}
            />
            <Switch
              label="Exigir consentimento antes da biometria"
              hint="Nenhuma captura ocorre sem o aceite formal do titular."
              {...form.register("requireConsentBeforeFacial")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cadastro biométrico"
            description="Regras do fluxo de cadastro via QR Code no totem."
            icon={<QrCode size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <Input
              label="Validade do token (horas)"
              type="number"
              min={1}
              error={errors.enrollmentTokenExpiryHours?.message}
              {...form.register("enrollmentTokenExpiryHours", asNumber)}
            />
            <Input
              label="Frames por cadastro"
              type="number"
              min={1}
              hint="Quantidade de capturas consolidadas no embedding final."
              error={errors.enrollmentMultiFrameCount?.message}
              {...form.register("enrollmentMultiFrameCount", asNumber)}
            />
            <Input
              label="Limiar de vivacidade no cadastro"
              type="number"
              step="0.01"
              min={0}
              hint="Mais rígido que o da chamada — o cadastro exige qualidade."
              error={errors.livenessThresholdEnrollment?.message}
              {...form.register("livenessThresholdEnrollment", asNumber)}
            />
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Totem"
            description="Comportamento dos dispositivos de parede: relógio e painel oculto."
            icon={<MonitorSmartphone size={18} strokeWidth={1.75} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Senha do painel do totem"
              placeholder="adminumc{{data}}@{{hora}}"
              hint="Aceita {{data}} (DDMM) e {{hora}} (HHMM) — a senha muda sozinha com o relógio. Vazio desativa a senha."
              autoComplete="off"
              spellCheck={false}
              className="font-mono-ds"
              error={errors.totemPanelPassword?.message}
              {...form.register("totemPanelPassword")}
            />
            <Select
              label="Fuso do relógio do totem"
              hint="Exibido na tela de descanso e de captura."
              options={[
                { value: "local", label: "Horário local do dispositivo" },
                { value: "America/Sao_Paulo", label: "Horário de Brasília" },
              ]}
              error={errors.totemClockTimezone?.message}
              {...form.register("totemClockTimezone")}
            />
          </CardBody>
        </Card>
      </div>
    </form>

    <CalibrationModal open={calibrating} onClose={() => setCalibrating(false)} />
    </>
  );
}
