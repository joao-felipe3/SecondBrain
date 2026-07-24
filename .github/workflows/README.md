# GitHub CI/CD Workflows

This directory contains all GitHub Actions workflows for the SecondBrain monorepo.

## Workflows

| Workflow             | File                           | Trigger                             | Purpose                                        |
| -------------------- | ------------------------------ | ----------------------------------- | ---------------------------------------------- |
| **Lint & Format**    | [`lint.yml`](lint.yml)         | PR + push to main                   | ESLint + Prettier checks                       |
| **Tests & Coverage** | [`test.yml`](test.yml)         | PR + push to main/develop           | Jest unit tests + 85% coverage gate            |
| **Build**            | [`build.yml`](build.yml)       | PR + push to main/develop           | TypeScript build + artifact validation         |
| **Security Scan**    | [`security.yml`](security.yml) | PR + push + weekly Monday 07:00 UTC | npm audit, TruffleHog, CodeQL, license check   |
| **Code Analysis**    | [`analyze.yml`](analyze.yml)   | PR + push to main/develop           | Coverage report comment, complexity, dead code |

## Coverage Thresholds

| Metric     | Threshold |
| ---------- | --------- |
| Statements | ≥ 80%     |
| Branches   | ≥ 50%     |
| Functions  | ≥ 75%     |
| Lines      | ≥ 80%     |

> Current achievement: **85.19% statements** (July 2026)

## Pre-commit Hooks (Husky)

Configured at monorepo root via `.husky/`:

| Hook         | Action                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| `pre-commit` | `lint-staged` — auto-fix ESLint + Prettier on staged `.ts`/`.vue` files              |
| `commit-msg` | `commitlint` — enforces [Conventional Commits](https://www.conventionalcommits.org/) |
| `pre-push`   | Quick smoke test of unit tests (non-blocking)                                        |

### Conventional Commit Format

```
<type>(<scope>): <short description>

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build
```

**Examples:**

```bash
feat(tasks): add PERT estimation endpoint
fix(projects): correct WBS budget normalization
test(rtm): expand controller unit coverage
chore(ci): add security scanning workflow
```

## Branch Protection Rules (Recommended)

Configure these in **Settings → Branches → Branch protection rules** for `main`:

### Required Status Checks

- ✅ `lint / lint`
- ✅ `test / test`
- ✅ `build / build`
- ✅ `security / dependency-audit`
- ✅ `coverage-analysis / coverage-analysis`

### Additional Rules

- ☑️ **Require a pull request before merging** (min. 1 reviewer)
- ☑️ **Require status checks to pass before merging**
- ☑️ **Require branches to be up to date before merging**
- ☑️ **Restrict who can push to matching branches** (main: only leads)
- ☐ Require signed commits _(optional — recommended for production)_
- ☑️ **Do not allow bypassing the above settings**

## Local Setup

### Install pre-commit hooks

```bash
# From monorepo root
npm install
# Husky is auto-configured via the `prepare` script
```

### Run checks locally

```bash
# Backend lint
cd Backend && npm run lint

# Backend tests + coverage
cd Backend && npm run test:cov

# Validate a commit message
echo "feat(api): add endpoint" | npx commitlint
```
