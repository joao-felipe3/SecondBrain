import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// ===========================================================================
// 1. Env Loader
// ===========================================================================
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...parts] = trimmed.split('=');
        if (key) {
          process.env[key.trim()] = parts.join('=').trim();
        }
      }
    }
  }
}

// ===========================================================================
// 2. Directory Scanner
// ===========================================================================
function getTsFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getTsFiles(filePath));
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('index.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

// ===========================================================================
// 3. Helper to count file lines
// ===========================================================================
function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

// ===========================================================================
// 4. Test Runner & Rollback
// ===========================================================================
function runTests(): boolean {
  console.log('🔄 Executando testes unitários e compilação para validação...');
  try {
    const isWin = process.platform === 'win32';
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    // Run tests with --runInBand to prevent Jest worker memory limit issues on Windows
    execSync(`${npmCmd} run test -- tests/unit/tasks --runInBand`, { stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error('❌ Os testes unitários ou a compilação falharam.');
    return false;
  }
}

function rollbackFile(filePath: string) {
  console.log(`⏪ Revertendo alterações para o arquivo: ${filePath}`);
  try {
    execSync(`git checkout -- "${filePath}"`, { stdio: 'inherit' });
    console.log('✅ Arquivo restaurado com sucesso.');
  } catch (err) {
    console.error('❌ Falha ao reverter arquivo usando git.', err);
  }
}

// ===========================================================================
// 5. Main AI Refactoring Engine
// ===========================================================================
async function auditFile(filePath: string, model: any): Promise<{ needsRefactoring: boolean; justification: string }> {
  const code = fs.readFileSync(filePath, 'utf8');
  console.log(`🤖 Enviando '${path.basename(filePath)}' para auditoria do Gemini...`);

  const prompt = [
    'Você é um auditor de código especialista em NestJS, TypeScript e arquitetura limpa.',
    'Sua tarefa é analisar o arquivo fornecido e decidir se ele precisa de refatoração para seguir as boas práticas.',
    '',
    'Regras de auditoria:',
    '1. SRP (Princípio de Responsabilidade Única): Cada classe e método deve fazer apenas uma coisa.',
    '2. Métodos curtos: Métodos muito longos (ex: >30-40 linhas de lógica útil) devem ser subdivididos em métodos auxiliares privados com responsabilidade única.',
    '3. Tratamento de Erros: Mantenha tratamento resiliente para chamadas assíncronas e externas.',
    '4. Interfaces Externas: Extraia interfaces ou tipos auxiliares grandes criados no corpo do arquivo de serviço.',
    '5. Flexibilidade de tamanho: Arquivos entre 150 e 300 linhas NÃO precisam obrigatoriamente ser divididos se estiverem limpos, bem estruturados e respeitarem o SRP.',
    '6. Compatibilidade estrita: Qualquer refatoração deve manter intacta a assinatura pública dos métodos de serviço e as regras de negócio para não quebrar testes ou injeção de dependências.',
    '',
    'Código atual do arquivo:',
    '----------------------------------------------------------------------',
    code,
    '----------------------------------------------------------------------'
  ].join('\n');

  const response = await model.generateContent(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            needsRefactoring: {
              type: SchemaType.BOOLEAN,
              description: 'Define se o arquivo de fato necessita de refatoração estrutural.'
            },
            justification: {
              type: SchemaType.STRING,
              description: 'Justificativa detalhada de por que o arquivo precisa ou não de refatoração.'
            }
          },
          required: ['needsRefactoring', 'justification']
        }
      }
    },
    { timeout: 120000 }
  );

  const candidate = response.response.candidates?.[0];
  if (candidate && candidate.finishReason !== 'STOP') {
    console.warn(`📡 A geração terminou prematuramente. Motivo: ${candidate.finishReason}`);
  }

  const rawText = response.response.text().trim();
  try {
    const parsed = JSON.parse(rawText);
    return {
      needsRefactoring: !!parsed.needsRefactoring,
      justification: parsed.justification || 'Nenhuma justificativa fornecida.'
    };
  } catch (err) {
    console.error('❌ Falha ao parsear JSON de auditoria. Retornando falso por segurança.');
    console.debug('Raw response:', rawText);
    return {
      needsRefactoring: false,
      justification: `Erro de parse no JSON retornado pela IA: ${(err as Error).message}`
    };
  }
}

async function refactorFile(filePath: string, model: any): Promise<string> {
  const code = fs.readFileSync(filePath, 'utf8');
  console.log(`🤖 Solicitando código refatorado para '${path.basename(filePath)}' ao Gemini...`);

  const prompt = [
    'Você é um refatorador de código especializado em NestJS, TypeScript e arquitetura limpa.',
    'Seu objetivo é refatorar o arquivo fornecido para aplicar estas regras estritas:',
    '1. SRP (Princípio de Responsabilidade Única): Cada classe e método deve fazer apenas uma coisa.',
    '2. Métodos curtos: Métodos com mais de 30-40 linhas de código útil devem ser subdivididos em métodos auxiliares privados com responsabilidade única.',
    '3. Interfaces Externas: Extraia interfaces ou tipos auxiliares grandes criados no corpo do arquivo de serviço.',
    '4. Tratamento de Erros: Mantenha tratamento de erros resiliente para chamadas assíncronas e externas.',
    '5. COMPATIBILIDADE ESTRITA (CRÍTICO): Você NÃO PODE alterar o nome da classe principal do arquivo, e NÃO PODE remover, renomear ou alterar a assinatura de nenhum método público exposto por essa classe. Não remova nenhuma classe ou tipo exportado que seja usado por outros arquivos. O objetivo é manter o mesmo contrato público para não quebrar a compilação, testes ou injeção de dependências do NestJS.',
    '',
    'REGRAS DE RESPOSTA:',
    '- Retorne APENAS o código TypeScript completo refatorado.',
    '- NÃO inclua blocos markdown como ```typescript.',
    '- NÃO inclua explicações ou texto extra.',
    '',
    'Código atual do arquivo:',
    '----------------------------------------------------------------------',
    code,
    '----------------------------------------------------------------------'
  ].join('\n');

  const response = await model.generateContent(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    },
    { timeout: 120000 }
  );

  let rawText = response.response.text().trim();

  // Limpa possíveis marcadores markdown do Gemini
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
  }

  return rawText;
}

// ===========================================================================
// 6. CLI Orchestrator
// ===========================================================================
async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetFileArg = args.find(a => a.startsWith('--file='));
  const targetFile = targetFileArg ? targetFileArg.split('=')[1] : null;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ Erro: GEMINI_API_KEY ou GOOGLE_API_KEY não definida no arquivo .env');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let modelName = process.env.GEMINI_MODEL || 'gemma-4-31b-it';
  if (modelName.startsWith('gemma-')) {
    modelName = process.env.GEMINI_STRONG_MODEL || 'gemini-3.1-pro-preview';
  }
  console.log(`🤖 Usando modelo para refatoração: ${modelName}`);
  const model = genAI.getGenerativeModel({ model: modelName });

  const servicesDir = path.resolve(__dirname, '../src/tasks/services');
  let files: string[] = [];

  if (targetFile) {
    const fullPath = path.resolve(process.cwd(), targetFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Erro: Arquivo especificado não encontrado: ${fullPath}`);
      process.exit(1);
    }
    files = [fullPath];
  } else {
    files = getTsFiles(servicesDir);
  }

  console.log(`🔍 Escaneando diretório de serviços de tarefas...`);
  console.log(`📁 Encontrados ${files.length} arquivos TypeScript.`);

  // Como o usuário deseja auditar todos os arquivos, definimos o limite de linhas para 0
  const thresholdLines = 0;
  const candidates: { path: string; lines: number }[] = [];

  for (const file of files) {
    const lines = countLines(file);
    if (lines >= thresholdLines) {
      candidates.push({ path: file, lines });
    }
  }

  console.log(`📋 Candidatos para auditoria (todos os ${candidates.length} arquivos encontrados):`);
  candidates.forEach(c => {
    console.log(`   - [${c.lines} linhas] ${path.relative(process.cwd(), c.path)}`);
  });

  if (dryRun) {
    console.log('\n🚫 Modo --dry-run ativo. Nenhuma alteração foi feita.');
    return;
  }

  if (candidates.length === 0) {
    console.log('\n✨ Nenhum arquivo encontrado.');
    return;
  }

  console.log('\n🚀 Iniciando auditoria e refatoração automatizada dos candidatos...');

  for (const c of candidates) {
    const relativePath = path.relative(process.cwd(), c.path);
    console.log(`\n======================================================================`);
    console.log(`🔎 Auditando: ${relativePath} (${c.lines} linhas)`);
    console.log(`======================================================================`);

    try {
      // Faz backup do arquivo original em memória antes de sobrescrever
      const originalCode = fs.readFileSync(c.path, 'utf8');

      // Executa a auditoria pela IA (Etapa 1)
      const audit = await auditFile(c.path, model);

      console.log(`📝 Justificativa da IA:\n   "${audit.justification}"`);

      if (!audit.needsRefactoring) {
        console.log(`✨ IA avaliou que este arquivo NÃO precisa de refatoração. Avançando.`);
        continue;
      }

      // Executa a refatoração pela IA (Etapa 2)
      const refactoredCode = await refactorFile(c.path, model);

      if (!refactoredCode || refactoredCode.length < 100) {
        console.warn('⚠️ IA sugeriu refatoração, mas não forneceu código refatorado válido. Pulando.');
        continue;
      }

      // Escreve o código refatorado
      fs.writeFileSync(c.path, refactoredCode, 'utf8');
      console.log('💾 Novo código gravado no arquivo. Validando integridade...');

      // Executa os testes unitários
      const success = runTests();

      if (success) {
        console.log(`✅ Refatoração aplicada com sucesso no arquivo: ${relativePath}`);
      } else {
        console.warn(`⚠️ Refatoração quebrou os testes do Jest. Iniciando rollback...`);
        fs.writeFileSync(c.path, originalCode, 'utf8'); // restauração imediata do backup em memória
        rollbackFile(c.path); // rollback complementar via git
      }
    } catch (err) {
      console.error(`❌ Erro crítico ao processar o arquivo: ${relativePath}`, err);
      rollbackFile(c.path);
    }
  }

  console.log('\n🎉 Processo de auditoria e refatoração concluído.');
}

if (require.main === module) {
  main().catch(console.error);
}
