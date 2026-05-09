# Scripts de Automação do VisageX

## `auto-changelog.js`

Detecta mudanças estruturais em `context/claude.md` e adiciona automaticamente entrada ao `CHANGELOG.md`.

### Como usar

**Automático (recomendado):**
O agente VisageX Dev chama automaticamente após editar `context/claude.md`:

```bash
node .github/scripts/auto-changelog.js "[descrição da mudança]"
```

**Manual:**

```bash
# Detecta mudanças e propõe entrada ao CHANGELOG
node .github/scripts/auto-changelog.js

# Com descrição customizada
node .github/scripts/auto-changelog.js "Agora escolas se registram via webhook de pagamento"
```

### O que detecta

- **Schema**: criação/remoção de tabelas, novas colunas
- **Workflows**: mudanças em fluxos ou processos
- **Modos**: alterações em flags de tenant (`pre_attendance_enabled`, etc)
- **Endpoints**: novos endpoints ou modificações
- **Segurança**: mudanças em criptografia (DEK, KEK) ou isolamento de tenant

### Saída

Gera entrada no `CHANGELOG.md` com:

```markdown
### Nome da Mudança

- **Data:** 8 de maio de 2026
- **Status:** Em progresso
- **Impactos:**
  - Backend: [impactos detectados]
  - Frontend: [impactos detectados]
  - Engine: [impactos detectados]
  - Banco: [impactos detectados]
```

### Integração com o agente

O agente VisageX Dev:

1. Edita `context/claude.md`
2. **Automaticamente** chama `auto-changelog.js` se detectar mudança estrutural
3. Propõe entrada para CHANGELOG
4. Você valida e faz commit

Sem nenhuma ação manual necessária!

---

## Fluxo completo

1. **Você (ou o agente) edita `context/claude.md`** com uma mudança estrutural
2. **O agente executa** `node .github/scripts/auto-changelog.js`
3. **Script detecta** padrões de mudança via `git diff`
4. **Script gera** entrada com impactos automáticos
5. **Entrada é adicionada** ao `CHANGELOG.md`
6. **Você valida** e faz commit
7. **Próximo prompt**: agente consulta CHANGELOG antes de implementar — está atualizado!

---

## Prompt de reportar mudança

Use `/report-structural-change` no chat para reportar mudança com descrição customizada:

```
/report-structural-change Agora cada tenant tem sua própria AES key (DEK)
```

O script rodará com sua descrição como título.
