#!/usr/bin/env bash
# Monta o corpo (texto puro + HTML) do e-mail de alerta do pipeline CI/CD.
#
# O HTML reaproveita o layout de backend/templates/email/layouts/base.hbs
# (mesma cor de header #080d18, mesmo cartão 600px, mesma logo em SVG) para
# que o alerta pareça vindo do mesmo sistema, não um e-mail genérico de CI.
#
# Espera as variáveis de ambiente RESULT_BACKEND, RESULT_ENGINE,
# RESULT_FRONTEND, RESULT_DEPLOY, BRANCH, EVENT, COMMIT_SHA, ACTOR, RUN_URL
# (ver o step "Montar e-mail de alerta" em ../ci-cd.yml) e escreve `body` e
# `html_body` em $GITHUB_OUTPUT.

set -euo pipefail

html_escape() {
  sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' <<<"$1"
}

# ── Rótulo + cores por resultado (mesma paleta do attendance-report.hbs) ────
badge_label() {
  case "$1" in
    success) echo "Passou" ;;
    failure) echo "Falhou" ;;
    cancelled) echo "Cancelado" ;;
    skipped) echo "Não rodou" ;;
    *) echo "$1" ;;
  esac
}
badge_bg() {
  case "$1" in
    success) echo "#dcefe4" ;;
    failure) echo "#fde2e2" ;;
    cancelled) echo "#fef3c7" ;;
    *) echo "#eef2f7" ;;
  esac
}
badge_fg() {
  case "$1" in
    success) echo "#1f7a4d" ;;
    failure) echo "#b91c1c" ;;
    cancelled) echo "#92400e" ;;
    *) echo "#69788f" ;;
  esac
}

badge_html() {
  local result="$1"
  printf '<span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:600;background-color:%s;color:%s;">%s</span>' \
    "$(badge_bg "$result")" "$(badge_fg "$result")" "$(badge_label "$result")"
}

row_html() {
  local label="$1" result="$2"
  printf '<tr><td style="padding:14px 0;border-bottom:1px solid #e1e7ef;font-size:15px;color:#0b1220;">%s</td><td style="padding:14px 0;border-bottom:1px solid #e1e7ef;text-align:right;">%s</td></tr>' \
    "$label" "$(badge_html "$result")"
}

BRANCH_SAFE=$(html_escape "$BRANCH")
ACTOR_SAFE=$(html_escape "$ACTOR")
EVENT_SAFE=$(html_escape "$EVENT")
SHA_SHORT="${COMMIT_SHA:0:7}"
YEAR=$(date -u +%Y)

# Lista curta pro preheader (o resumo que aparece ao lado do assunto na caixa
# de entrada) — só o que falhou, não a tabela inteira.
FAILED_STEPS=""
[ "$RESULT_BACKEND" = "failure" ] && FAILED_STEPS="$FAILED_STEPS backend"
[ "$RESULT_ENGINE" = "failure" ] && FAILED_STEPS="$FAILED_STEPS engine"
[ "$RESULT_FRONTEND" = "failure" ] && FAILED_STEPS="$FAILED_STEPS frontend"
[ "$RESULT_DEPLOY" = "failure" ] && FAILED_STEPS="$FAILED_STEPS deploy"
FAILED_STEPS="${FAILED_STEPS# }"
FAILED_STEPS="${FAILED_STEPS:-etapa indefinida}"

# ── Corpo em texto puro (fallback para clientes sem HTML) ──────────────────
{
  echo "body<<__VISAGE_CI_BODY__"
  echo "O pipeline CI/CD do Visage falhou (falhou em: ${FAILED_STEPS})."
  echo ""
  echo "Branch: ${BRANCH}"
  echo "Evento: ${EVENT}"
  echo "Commit: ${COMMIT_SHA}"
  echo "Autor: ${ACTOR}"
  echo ""
  echo "Resultado por etapa:"
  echo "  backend  (testes): ${RESULT_BACKEND}"
  echo "  engine   (testes): ${RESULT_ENGINE}"
  echo "  frontend (testes): ${RESULT_FRONTEND}"
  echo "  deploy            : ${RESULT_DEPLOY}"
  echo ""
  echo "Detalhes: ${RUN_URL}"
  echo "__VISAGE_CI_BODY__"
} >>"$GITHUB_OUTPUT"

# ── Corpo em HTML (mesmo shell visual do base.hbs) ──────────────────────────
{
  echo "html_body<<__VISAGE_CI_HTML__"
  cat <<HTML
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Visage</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      Falhou em: ${FAILED_STEPS} — branch ${BRANCH_SAFE}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f8fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e1e7ef;">

            <!-- Header -->
            <tr>
              <td style="background-color:#080d18;padding:36px 40px;text-align:left;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-right:10px;vertical-align:middle;">
                      <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNjEgMjU3IiBmaWxsPSIjZmZmZmZmIj48cGF0aCBkPSJNNDcuMDkwOCAyNC40NTA0QzQ3LjI0MiAyNC41NzI1IDQ4LjcwNTggMjguOTk5NyA0OC45NjcgMjkuNjkwN0M1MC40MjU5IDMzLjY0ODUgNTIuMjUzMiAzNy40NjA2IDU0LjQyNDggNDEuMDc2OEM2Ny42MzA4IDYyLjYwMjMgOTcuNTAyIDc3LjQ2ODggMTE5Ljk2OCA4Ny4zNzc4QzE0NS42MjcgOTguNjk1MyAxNzMuODMgMTA3Ljk3NCAxOTIuNjY3IDEzMC4xNDRDMjAyLjQ2OCAxNDEuNjggMjA3LjkwMSAxNTUuOTg3IDIwOC4yNzcgMTcxLjEyM0MyMDguMzQ5IDE3NC44MDYgMjA3Ljg2NyAxNzguNjg0IDIwNy41MDQgMTgyLjM5MUMyMTYuNDIzIDE2Ny41MDIgMjE0Ljk3MSAxNDQuMzAyIDIwNC41MjEgMTMwLjQ5OEMyMTEuMTA0IDEyNi4zODQgMjE3LjMxIDEyMS4yNDkgMjIzLjg1NSAxMTcuNTA2QzIxNS4zMTcgMTE1LjU4NSAyMTMuMDgyIDExMi4zMDMgMjA4LjQ1MSAxMDUuNzQ4QzIxNi41OTggMTA4LjUyNiAyMjkuMzk2IDEwOC41MDUgMjM3Ljc4OSAxMDYuNTcxQzI1MC40NTQgMTAzLjY1MyAyNzIuMDM4IDk1LjM1OTYgMjgwLjY0NCAxMDkuOTE4QzI5MS43NzUgMTEwLjQ1OCAzMDMuMjU5IDExMC41NTggMzA3LjQxIDEyMi43MzNDMzA4LjUxMiAxMjUuOTY2IDMwOC42OTEgMTI4LjQ5NiAzMDkuMjgzIDEzMS43OTdDMzA2LjUyNiAxMzAuMzQ4IDMwMi4xNTcgMTI5LjA2NCAyOTguOTk2IDEyOS4zMThDMjY0LjAwNCAxMzEuOTI1IDI0NS43NzkgMTY3LjQ4MiAyMjcuMDY2IDE5Mi41ODhDMjAxLjk0NSAyMjYuMjkyIDE3NC4wNzQgMjM3Ljc5MiAxMzMuMTc4IDIzOC45MjZDMTE4Ljc5OSAyMzkuMDgzIDEwNi42MTMgMjM2LjUwMSA5Mi45MTk5IDIzMi44MDJDOTguMjI0NSAyMzEuODEgMTAyLjYyNCAyMzEuMzUgMTA3Ljk0NiAyMjkuNzk1QzEyMS4wMzggMjI1Ljk3MSAxMzQuMTY0IDIxOC4xNTQgMTQyLjU3OCAyMDcuMjUyQzE0My45OTUgMjA1LjQxNSAxNDUuNDUgMjAzLjcyOCAxNDYuNTg5IDIwMS42ODhDMTUwLjY0NiAyMTAuMzEgMTUwLjA0OCAyMTguMTQxIDE0Ni4wNjIgMjI2Ljc5QzE1My4wNDggMjIyLjU0MyAxNTYuNjgxIDIxMi45MDcgMTU2LjAyNyAyMDQuOTc4QzE1NC4yNDMgMTgzLjUxNyAxMzEuOTU0IDE3Ni4yNjIgMTE0Ljg5OSAxNzAuMDcyQzk1LjM3NCAxNjIuOTg2IDc1LjM2NDggMTU4LjU5MiA1OS40NDA5IDE0NC40MDdDNDcuNzAyIDEzMy45NDkgNDAuMzQ5MiAxMTkuNjk3IDM3LjM3MyAxMDQuMzNDMzYuMjAyOCA5OC4yODgzIDM1Ljc4NDIgOTEuNzU4MSAzNS4zOTcgODUuNjUxQzM2LjA1MTYgODcuMzgwOSAzNy4xMTQxIDg5LjI4ODQgMzguMTIwNiA5MC44ODY2QzU5LjE3NDggMTI0LjMxOCAxMDAuNzI0IDEyOS4yNzEgMTM0LjIyNiAxNDMuMDcxQzE0MS43NCAxNDYuMTY3IDE1MC4yNjcgMTUyLjI2NyAxNTYuNTE3IDE1Ni43NzRDMTQ4Ljg1NyAxNDMuNTUgMTM2LjYwNiAxMzYuODQ1IDEyMy4zNjUgMTMwLjAyOEM5Ny44MjIyIDExNi44NzcgNjUuNDA5MyAxMDcuNjY3IDUwLjEwOTEgODEuMjQwOUMzOS4yOTA0IDYyLjU1NTIgNDEuODM1NCA0My43NDk3IDQ3LjA5MDggMjQuNDUwNFoiLz48L3N2Zz4=" width="27" height="19" alt="" style="display:block;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Visage</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Conteúdo -->
            <tr>
              <td style="padding:44px 40px;">
                <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0b1220;line-height:1.3;">
                  Pipeline CI/CD falhou
                </h1>
                <p style="margin:0 0 32px 0;font-size:15px;color:#69788f;line-height:1.7;">
                  A execução iniciada por <strong>${ACTOR_SAFE}</strong> na branch
                  <strong>${BRANCH_SAFE}</strong> (${EVENT_SAFE}) não passou em todas as etapas.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px 0;">
                  $(row_html "Backend — testes" "$RESULT_BACKEND")
                  $(row_html "Face engine — testes" "$RESULT_ENGINE")
                  $(row_html "Frontend — testes" "$RESULT_FRONTEND")
                  $(row_html "Deploy" "$RESULT_DEPLOY")
                </table>

                <p style="margin:0 0 32px 0;font-size:13px;color:#69788f;line-height:1.9;">
                  Commit
                  <code style="background-color:#f6f8fb;border:1px solid #e1e7ef;border-radius:4px;padding:2px 6px;font-family:ui-monospace,Consolas,monospace;color:#364152;">${SHA_SHORT}</code>
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">
                  <tr>
                    <td style="border-radius:10px;background-color:#2563eb;">
                      <a href="${RUN_URL}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
                        Ver execução completa
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:13px;color:#69788f;line-height:1.7;">
                  <a href="${RUN_URL}" style="color:#2563eb;text-decoration:none;word-break:break-all;">${RUN_URL}</a>
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 40px;">
                <div style="height:1px;background-color:#e1e7ef;"></div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color:#f6f8fb;padding:32px 40px 36px 40px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-right:7px;vertical-align:middle;">
                      <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNjEgMjU3IiBmaWxsPSIjOWFhN2JkIj48cGF0aCBkPSJNNDcuMDkwOCAyNC40NTA0QzQ3LjI0MiAyNC41NzI1IDQ4LjcwNTggMjguOTk5NyA0OC45NjcgMjkuNjkwN0M1MC40MjU5IDMzLjY0ODUgNTIuMjUzMiAzNy40NjA2IDU0LjQyNDggNDEuMDc2OEM2Ny42MzA4IDYyLjYwMjMgOTcuNTAyIDc3LjQ2ODggMTE5Ljk2OCA4Ny4zNzc4QzE0NS42MjcgOTguNjk1MyAxNzMuODMgMTA3Ljk3NCAxOTIuNjY3IDEzMC4xNDRDMjAyLjQ2OCAxNDEuNjggMjA3LjkwMSAxNTUuOTg3IDIwOC4yNzcgMTcxLjEyM0MyMDguMzQ5IDE3NC44MDYgMjA3Ljg2NyAxNzguNjg0IDIwNy41MDQgMTgyLjM5MUMyMTYuNDIzIDE2Ny41MDIgMjE0Ljk3MSAxNDQuMzAyIDIwNC41MjEgMTMwLjQ5OEMyMTEuMTA0IDEyNi4zODQgMjE3LjMxIDEyMS4yNDkgMjIzLjg1NSAxMTcuNTA2QzIxNS4zMTcgMTE1LjU4NSAyMTMuMDgyIDExMi4zMDMgMjA4LjQ1MSAxMDUuNzQ4QzIxNi41OTggMTA4LjUyNiAyMjkuMzk2IDEwOC41MDUgMjM3Ljc4OSAxMDYuNTcxQzI1MC40NTQgMTAzLjY1MyAyNzIuMDM4IDk1LjM1OTYgMjgwLjY0NCAxMDkuOTE4QzI5MS43NzUgMTEwLjQ1OCAzMDMuMjU5IDExMC41NTggMzA3LjQxIDEyMi43MzNDMzA4LjUxMiAxMjUuOTY2IDMwOC42OTEgMTI4LjQ5NiAzMDkuMjgzIDEzMS43OTdDMzA2LjUyNiAxMzAuMzQ4IDMwMi4xNTcgMTI5LjA2NCAyOTguOTk2IDEyOS4zMThDMjY0LjAwNCAxMzEuOTI1IDI0NS43NzkgMTY3LjQ4MiAyMjcuMDY2IDE5Mi41ODhDMjAxLjk0NSAyMjYuMjkyIDE3NC4wNzQgMjM3Ljc5MiAxMzMuMTc4IDIzOC45MjZDMTE4Ljc5OSAyMzkuMDgzIDEwNi42MTMgMjM2LjUwMSA5Mi45MTk5IDIzMi44MDJDOTguMjI0NSAyMzEuODEgMTAyLjYyNCAyMzEuMzUgMTA3Ljk0NiAyMjkuNzk1QzEyMS4wMzggMjI1Ljk3MSAxMzQuMTY0IDIxOC4xNTQgMTQyLjU3OCAyMDcuMjUyQzE0My45OTUgMjA1LjQxNSAxNDUuNDUgMjAzLjcyOCAxNDYuNTg5IDIwMS42ODhDMTUwLjY0NiAyMTAuMzEgMTUwLjA0OCAyMTguMTQxIDE0Ni4wNjIgMjI2Ljc5QzE1My4wNDggMjIyLjU0MyAxNTYuNjgxIDIxMi45MDcgMTU2LjAyNyAyMDQuOTc4QzE1NC4yNDMgMTgzLjUxNyAxMzEuOTU0IDE3Ni4yNjIgMTE0Ljg5OSAxNzAuMDcyQzk1LjM3NCAxNjIuOTg2IDc1LjM2NDggMTU4LjU5MiA1OS40NDA5IDE0NC40MDdDNDcuNzAyIDEzMy45NDkgNDAuMzQ5MiAxMTkuNjk3IDM3LjM3MyAxMDQuMzNDMzYuMjAyOCA5OC4yODgzIDM1Ljc4NDIgOTEuNzU4MSAzNS4zOTcgODUuNjUxQzM2LjA1MTYgODcuMzgwOSAzNy4xMTQxIDg5LjI4ODQgMzguMTIwNiA5MC44ODY2QzU5LjE3NDggMTI0LjMxOCAxMDAuNzI0IDEyOS4yNzEgMTM0LjIyNiAxNDMuMDcxQzE0MS43NCAxNDYuMTY3IDE1MC4yNjcgMTUyLjI2NyAxNTYuNTE3IDE1Ni43NzRDMTQ4Ljg1NyAxNDMuNTUgMTM2LjYwNiAxMzYuODQ1IDEyMy4zNjUgMTMwLjAyOEM5Ny44MjIyIDExNi44NzcgNjUuNDA5MyAxMDcuNjY3IDUwLjEwOTEgODEuMjQwOUMzOS4yOTA0IDYyLjU1NTIgNDEuODM1NCA0My43NDk3IDQ3LjA5MDggMjQuNDUwNFoiLz48L3N2Zz4=" width="14" height="10" alt="" style="display:block;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-size:13px;font-weight:700;color:#4d5b72;letter-spacing:-0.01em;">Visage</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0 0;font-size:12px;color:#9aa7bd;line-height:1.7;">
                  Alerta automático do pipeline de CI/CD. Não é preciso responder este e-mail.
                </p>
                <p style="margin:10px 0 0 0;font-size:12px;color:#9aa7bd;line-height:1.7;">
                  &copy; ${YEAR} Visage &mdash; Chamada escolar com reconhecimento facial
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
HTML
  echo "__VISAGE_CI_HTML__"
} >>"$GITHUB_OUTPUT"
