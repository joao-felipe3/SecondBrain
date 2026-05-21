# ADR-001: Why NestJS + Mongoose

- Status: accepted
- Date: 2026-05-21

## Context
We need a backend that is modular, testable, and consistent across a growing codebase. The project uses TypeScript and MongoDB, so the stack should provide strong typing, dependency injection, and a mature ODM for Mongo.

## Decision
Adopt NestJS for the application framework and Mongoose for MongoDB data access.

## Rationale
- NestJS provides a modular architecture, dependency injection, and a strong TypeScript-first developer experience.
- Mongoose provides schema modeling, validation, and middleware that align with the domain complexity (Tasks, Projects, Settings).
- The combination is widely supported in the NestJS ecosystem (including `@nestjs/mongoose`).

## Consequences
- Positive:
  - Clear module boundaries and DI improve maintainability.
  - Schema-level validation complements DTO validation.
  - Large ecosystem and community support.
- Negative:
  - Mongoose introduces ODM-specific patterns and potential performance pitfalls if misused.
  - Upgrades must stay within the `@nestjs/mongoose` peer dependency range.

## Alternatives Considered
- Express + custom DI: too much boilerplate and lower consistency.
- TypeORM with Mongo: weaker MongoDB feature coverage.
- Prisma: limited MongoDB feature parity for this domain.
