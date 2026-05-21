# ADR-002: Module Separation by Domain

- Status: accepted
- Date: 2026-05-21

## Context
The backend has multiple domains (tasks, projects, settings) with distinct responsibilities and different change rates. Without clear boundaries, services become large, tightly coupled, and hard to test.

## Decision
Split the backend into domain-focused modules: `TasksModule`, `ProjectsModule`, and `SettingsModule`.

## Rationale
- Enables focused ownership and clearer responsibilities per module.
- Encourages smaller services, controllers, and DTOs.
- Allows independent refactoring and testing per domain.

## Consequences
- Positive:
  - Reduced mental load per module.
  - Easier onboarding and navigation.
  - Boundaries help enforce SRP during refactors.
- Negative:
  - Cross-domain workflows require explicit interfaces or orchestration.
  - Some cycles exist (Tasks <-> Projects), requiring `forwardRef`.

## Alternatives Considered
- Single monolithic module: faster initially but hard to scale.
- Layered-only structure without domain modules: less clarity for ownership.
