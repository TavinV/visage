/**
 * Demo Requests Routes — Formulário público de "Solicitar demonstração".
 *
 * Rota PÚBLICA (sem autenticação): a instituição ainda não tem conta.
 * Protegida por rate limit dedicado + unicidade de e-mail/telefone.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { demoRequestsService } from "../services/demo-requests.service";
import { validate } from "../middleware/validate";

const router = Router();

const PLAN_NAMES = ["Starter", "Escola", "Instituto"] as const;

const CreateDemoRequestSchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(2, "Informe seu nome")
    .max(150, "Nome muito longo"),
  institutionName: z
    .string()
    .trim()
    .min(2, "Informe o nome da instituição")
    .max(200, "Nome muito longo"),
  studentCount: z
    .number({ invalid_type_error: "Informe a quantidade de alunos" })
    .int("Quantidade inválida")
    .positive("Quantidade inválida")
    .max(1_000_000, "Quantidade inválida"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .max(255, "E-mail muito longo"),
  // Aceita telefone mascarado; validamos pela contagem de dígitos.
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const d = v.replace(/\D/g, "");
      return d.length === 10 || d.length === 11;
    }, "Telefone inválido — inclua DDD"),
  plan: z.enum(PLAN_NAMES).default("Escola"),
});

type CreateDemoRequestBody = z.infer<typeof CreateDemoRequestSchema>;

/**
 * POST /demo-requests
 * Registra uma solicitação de demonstração e notifica o time comercial.
 */
router.post(
  "/",
  validate(CreateDemoRequestSchema),
  async (
    req: Request<{}, {}, CreateDemoRequestBody>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await demoRequestsService.create(req.body);
      res.status(201).json({ data: { id: result.id } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
