# GitHub Actions Workflows

Este diretório contém workflows do GitHub Actions para CI/CD automatizado.

## Workflows Disponíveis

### 1. **lint.yml** - Linting e Formatação
Executa:
- ESLint para detecção de problemas
- Prettier para verificação de formatação
- Falha se houver issues

**Trigger:** `pull_request`, `push` para main

**Tempo estimado:** ~2 minutos

---

### 2. **test.yml** - Testes e Cobertura
Executa:
- npm test (Jest)
- Coleta coverage
- Upload para Codecov
- Falha se cobertura < limiar

**Trigger:** `pull_request`, `push`

**Tempo estimado:** ~5 minutos

---

### 3. **build.yml** - Validação de Build
Executa:
- npm build
- Valida bundle size
- Alerta se crescimento > 10%

**Trigger:** `pull_request`, `push`

**Tempo estimado:** ~3 minutos

---

### 4. **security.yml** - Verificação de Segurança
Executa:
- npm audit
- Snyk ou OWASP Dependency-Check
- Falha se vulnerabilidades críticas encontradas

**Trigger:** `pull_request`, `push`, schedule (semanal)

**Tempo estimado:** ~2 minutos

---

### 5. **analyze.yml** - Análise de Qualidade
Executa:
- SonarQube análise
- Verifica code smells
- Verifica duplicação
- Gera relatório

**Trigger:** `pull_request`, `push` para main

**Tempo estimado:** ~4 minutos

---

**Última atualização:** 18/05/2026
