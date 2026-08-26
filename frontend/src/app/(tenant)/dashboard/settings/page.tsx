"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  ScanFace,
  ClipboardCheck,
  ShieldAlert,
  IdCard,
  Fingerprint,
  MonitorSmartphone,
  Image as ImageIcon,
} from "lucide-react";
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
import { PhotoUpload } from "@/components/app/PhotoUpload";
import { useAuthenticatedImage } from "@/lib/useAuthenticatedImage";
import { useAuth } from "@/lib/auth";

// O backend não impõe teto — o limiar de reconhecimento pode passar de 1
// (escala de distância, ex.: 1.1 com thresholds dinâmicos).
const threshold = (label: string) => z.number(`Informe ${label}.`).min(0, "Mínimo 0.");

const SettingsSchema = z.object({
  recognitionThreshold: threshold("o limiar de reconhecimento"),
  livenessEnabled: z.boolean(),
  livenessThreshold: threshold("o limiar de vivacidade"),
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
  enrollmentMultiFrameCount: z
    .number("Informe a quantidade.")
    .int("Use um número inteiro.")
    .min(1, "Mínimo 1 frame."),
  livenessThresholdEnrollment: threshold("o limiar de vivacidade do cadastro"),
  totemPanelPassword: z.string().max(200, "Máximo de 200 caracteres.").optional().or(z.literal("")),
  totemClockTimezone: z.string(),
  studentIdentification: z.enum(["cpf", "enrollment_code", "both"]),
  totemIdentification: z.enum(["cpf", "enrollment_code", "any"]),
  validateCpf: z.boolean(),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

const registeredLabel: Record<string, string> = {
  cpf: "o CPF",
  enrollment_code: "a matrícula interna",
  both: "o CPF e a matrícula interna",
};

const totemLabel: Record<string, string> = {
  cpf: "o CPF",
  enrollment_code: "a matrícula",
  any: "o CPF ou a matrícula",
};

/** Frase que traduz a combinação escolhida — evita interpretar dois selects. */
function identificationSummary(student: string, totem: string): string {
  return `Cada aluno é cadastrado com ${registeredLabel[student] ?? "o CPF"}. No totem, ele digita ${totemLabel[totem] ?? "o CPF"} para iniciar o cadastro biométrico.`;
}

const asNumber = {
  setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const settings = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: () => api.get<{ data: TenantSettings }>("/tenant-settings"),
  });

  const hasLogo = settings.data?.data.hasLogo ?? false;
  const logoUrl = useAuthenticatedImage("/tenant-settings/logo", {
    enabled: hasLogo,
    cacheKey: settings.data?.data.logoUpdatedAt,
  });

  const refreshLogo = () => queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });

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
      allowManualOverride: s.allowManualOverride,
      preAttendanceEnabled: s.preAttendanceEnabled,
      preAttendanceWindowMin: s.preAttendanceWindowMin,
      individualCheckoutEnabled: s.individualCheckoutEnabled,
      saveFraudFrames: s.saveFraudFrames,
      fraudRetentionHours: s.fraudRetentionHours,
      requireConsentBeforeFacial: s.requireConsentBeforeFacial,
      enrollmentMultiFrameCount: s.enrollmentMultiFrameCount,
      livenessThresholdEnrollment: s.livenessThresholdEnrollment,
      totemPanelPassword: s.totemPanelPassword ?? "",
      totemClockTimezone: s.totemClockTimezone ?? "local",
      studentIdentification: s.studentIdentification ?? "cpf",
      totemIdentification: s.totemIdentification ?? "cpf",
      validateCpf: s.validateCpf ?? true,
    });
  }, [settings.data, form]);

  // O totem só pode pedir um identificador que a instituição registra —
  // trocar o cadastro para "só matrícula" precisa arrastar o totem junto,
  // senão o aluno chega numa tela pedindo um CPF que ninguém cadastrou
  const studentIdentification = form.watch("studentIdentification");
  useEffect(() => {
    if (!studentIdentification) return;
    const current = form.getValues("totemIdentification");
    if (studentIdentification === "cpf" && current !== "cpf") {
      form.setValue("totemIdentification", "cpf");
    }
    if (studentIdentification === "enrollment_code" && current !== "enrollment_code") {
      form.setValue("totemIdentification", "enrollment_code");
    }
  }, [studentIdentification, form]);

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

  return (
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
        {/* Identidade visual fica fora do submit — upload é imediato */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Identidade visual"
            description="Logo da instituição, exibida no console e nas telas do totem."
            icon={<ImageIcon size={18} strokeWidth={1.75} />}
          />
          <CardBody>
            <PhotoUpload
              name={user?.name ?? "Instituição"}
              shape="square"
              currentUrl={logoUrl}
              hasPhoto={hasLogo}
              cropTitle="Enquadrar a logo"
              hint="JPEG ou PNG. Você enquadra a logo antes de enviar — dê zoom para fora se ela for larga."
              onUpload={async (imageB64) => {
                await api.put("/tenant-settings/logo", { imageB64 });
                await refreshLogo();
                toast.success("Logo atualizada.");
              }}
              onRemove={async () => {
                await api.delete("/tenant-settings/logo");
                await refreshLogo();
                toast.success("Logo removida.");
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Reconhecimento"
            description="Sensibilidade do reconhecimento facial e da proteção contra fraudes (fotos, vídeos e telas)."
            icon={<ScanFace size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <Input
              label="Limiar de reconhecimento"
              type="number"
              step="0.01"
              min={0}
              hint="Nível de exigência da comparação facial — valores maiores tornam o reconhecimento mais rígido."
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
            {/* Estes são os valores da instituição; cada totem pode ter os
                seus, medidos na própria sala pela calibração guiada. */}
            <p className="rounded-lg bg-flauzino-slate-100 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-600">
              Não sabe que números usar? Em{" "}
              <Link
                href="/dashboard/devices"
                className="font-medium text-flauzino-accent-600 underline-offset-2 hover:underline"
              >
                Dispositivos
              </Link>{" "}
              você calibra pela câmera de cada totem, e o sistema sugere os
              valores certos para a luz daquela sala.
            </p>
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
              label="Salvar fotos das tentativas de fraude"
              hint="Tentativas bloqueadas ficam disponíveis na auditoria."
              {...form.register("saveFraudFrames")}
            />
            <Input
              label="Retenção das fotos (horas)"
              type="number"
              min={1}
              hint="Após o prazo, as fotos são apagadas automaticamente."
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

        <Card className="xl:col-span-2">
          <CardHeader
            title="Identificação do aluno"
            description="O que a secretaria registra na ficha do aluno e o que ele digita no totem antes da biometria."
            icon={<IdCard size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Registrado no cadastro"
                hint="Campos exigidos ao criar um aluno. Instituição que não quer guardar CPF trabalha só com a matrícula."
                options={[
                  { value: "cpf", label: "Somente CPF" },
                  { value: "enrollment_code", label: "Somente matrícula" },
                  { value: "both", label: "CPF e matrícula" },
                ]}
                error={errors.studentIdentification?.message}
                {...form.register("studentIdentification")}
              />
              <Select
                label="Digitado no totem"
                hint="O que o aluno informa para se identificar antes da captura facial."
                options={
                  studentIdentification === "both"
                    ? [
                        { value: "cpf", label: "CPF" },
                        { value: "enrollment_code", label: "Matrícula" },
                        { value: "any", label: "CPF ou matrícula" },
                      ]
                    : studentIdentification === "enrollment_code"
                      ? [{ value: "enrollment_code", label: "Matrícula" }]
                      : [{ value: "cpf", label: "CPF" }]
                }
                error={errors.totemIdentification?.message}
                {...form.register("totemIdentification")}
              />
            </div>
            <p className="rounded-lg bg-flauzino-accent-50 px-4 py-3 text-[13px] leading-relaxed text-flauzino-slate-700">
              {identificationSummary(
                studentIdentification,
                form.watch("totemIdentification")
              )}
            </p>
            <Switch
              label="Validar o CPF no cadastro"
              hint="Confere os dígitos verificadores. Desligue para aceitar CPF fora do padrão da Receita — útil ao importar uma base antiga."
              disabled={studentIdentification === "enrollment_code"}
              {...form.register("validateCpf")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cadastro biométrico"
            description="Regras da captura facial feita no totem."
            icon={<Fingerprint size={18} strokeWidth={1.75} />}
          />
          <CardBody className="flex flex-col gap-4">
            <Input
              label="Fotos por cadastro"
              type="number"
              min={1}
              hint="Quantidade de capturas usadas para gerar o cadastro facial final."
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
  );
}
