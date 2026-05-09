#!/usr/bin/env node

/**
 * Script para detectar mudanças estruturais em context/claude.md
 * e adicionar automaticamente entrada no CHANGELOG.md
 *
 * Uso: node .github/scripts/auto-changelog.js "[descrição]"
 * Ou automático via agente: o agente chama este script após editar context/claude.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const CONTEXT_PATH = path.join(__dirname, '..', '..', 'context', 'claude.md');

/**
 * Detecta mudanças estruturais comparando versão anterior com atual
 */
function detectStructuralChanges() {
  try {
    // Git diff: mostra o que mudou em context/claude.md
    const diff = execSync('git diff context/claude.md', { encoding: 'utf8' });
    
    if (!diff.trim()) {
      return null; // Sem mudanças
    }

    // Padrões que indicam mudança estrutural
    const patterns = {
      newTable: /CREATE TABLE \+.*\(|^\+.*CREATE TABLE/m,
      removedTable: /CREATE TABLE.*\(|-.*CREATE TABLE/m,
      newColumn: /^\+\s+([\w_]+)\s+\w+/m,
      removedColumn: /^-\s+([\w_]+)\s+\w+/m,
      schema: /CREATE TABLE|ALTER TABLE/,
      workflow: /^#+.*Fluxo|^-+.*flow|workflow|processo/im,
      mode: /pre_attendance|individual_checkout|institution_type/,
      security: /encryption|DEK|KEK|MASTER_KEY|tenant_id|isolat/i,
      endpoint: /POST|GET|PATCH|DELETE.*\/api/,
    };

    const detected = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(diff)) {
        detected[key] = true;
      }
    }

    return detected;
  } catch (err) {
    console.error('Erro ao executar git diff:', err.message);
    return null;
  }
}

/**
 * Gera sugestão de entrada para CHANGELOG baseada em mudanças detectadas
 */
function generateChangelogEntry(detected, userDescription) {
  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  let impactBackend = [];
  let impactFrontend = [];
  let impactEngine = [];
  let impactBank = [];

  if (detected.schema) {
    impactBank.push('Nova tabela ou alteração de schema');
  }
  if (detected.newColumn || detected.removedColumn) {
    impactBank.push(`Colunas ${detected.newColumn ? 'adicionadas' : detected.removedColumn ? 'removidas' : ''}`);
  }
  if (detected.workflow) {
    impactBackend.push('Fluxo ou lógica alterada');
    impactFrontend.push('UI/UX do fluxo pode mudar');
  }
  if (detected.endpoint) {
    impactBackend.push('Novo endpoint ou rota modificada');
    impactFrontend.push('Chamadas à API podem mudar');
  }
  if (detected.mode) {
    impactBackend.push('Modos de operação ou flags de tenant alteradas');
    impactFrontend.push('Painel pode habilitar/desabilitar funcionalidades');
  }
  if (detected.security) {
    impactBackend.push('Criptografia ou isolamento de tenant alterado');
    impactEngine.push('DEK, chaves ou descriptografia podem mudar');
  }

  // Montar entrada
  let entry = `\n### ${userDescription || 'Mudança estrutural detectada'}\n`;
  entry += `- **Data:** ${date}\n`;
  entry += `- **Status:** Em progresso\n`;
  entry += `- **Impactos:**\n`;
  
  if (impactBackend.length) {
    entry += `  - Backend: ${impactBackend.join(', ')}\n`;
  }
  if (impactFrontend.length) {
    entry += `  - Frontend: ${impactFrontend.join(', ')}\n`;
  }
  if (impactEngine.length) {
    entry += `  - Engine: ${impactEngine.join(', ')}\n`;
  }
  if (impactBank.length) {
    entry += `  - Banco: ${impactBank.join(', ')}\n`;
  }

  return entry;
}

/**
 * Adiciona entrada ao CHANGELOG
 */
function appendToChangelog(entry) {
  try {
    let content = fs.readFileSync(CHANGELOG_PATH, 'utf8');

    // Encontra a seção de versão atual
    const versionMatch = content.match(/## Versão atual\n\n### v[\d.]+.*?\([\d\s a-záéíóú]+\)/);
    
    if (!versionMatch) {
      console.error('Não foi encontrada seção "Versão atual" no CHANGELOG.md');
      return false;
    }

    // Insere a entrada após a primeira seção de versão
    const insertIndex = content.indexOf(versionMatch[0]) + versionMatch[0].length;
    content = content.slice(0, insertIndex) + '\n' + entry + content.slice(insertIndex);

    fs.writeFileSync(CHANGELOG_PATH, content, 'utf8');
    console.log('✅ Entrada adicionada ao CHANGELOG.md');
    return true;
  } catch (err) {
    console.error('Erro ao atualizar CHANGELOG:', err.message);
    return false;
  }
}

/**
 * Main
 */
function main() {
  const userDescription = process.argv[2] || null;

  console.log('🔍 Detectando mudanças estruturais em context/claude.md...\n');

  const detected = detectStructuralChanges();

  if (!detected) {
    console.log('ℹ️  Nenhuma mudança em context/claude.md detectada.');
    process.exit(0);
  }

  console.log('📊 Mudanças detectadas:');
  Object.entries(detected).forEach(([key, value]) => {
    if (value) console.log(`   ✓ ${key}`);
  });

  console.log('\n📝 Gerando entrada de CHANGELOG...');
  const entry = generateChangelogEntry(detected, userDescription);

  console.log('\nEntrada proposta:\n');
  console.log(entry);

  console.log('\n💾 Adicionando ao CHANGELOG.md...');
  const success = appendToChangelog(entry);

  if (success) {
    console.log('\n✨ Sucesso! Execute `git add .github/CHANGELOG.md` e faça commit.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
