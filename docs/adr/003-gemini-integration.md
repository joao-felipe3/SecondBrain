# ADR-005: Gemini API Integration

- Status: accepted
- Date: 2026-05-21

## Context
The product uses AI to generate suggestions (WBS decomposition, microtasks, feedback). We need a consistent integration layer with guardrails and predictable outputs.

## Decision
Integrate Gemini via a dedicated service layer (e.g., `GeminiService` and AI-specific helpers) that encapsulates prompt building, model selection, and error handling.

## Rationale
- Centralizes AI configuration (model, temperature, retry policy).
- Simplifies testing by mocking a single service.
- Enables guardrails for prompt size and output validation.

## Consequences
- Positive:
  - Faster iteration on AI prompts.
  - Better observability and retry control.
- Negative:
  - Requires explicit data sanitization to avoid leaking sensitive information.
  - AI outputs require validation and fallbacks.

## Alternatives Considered
- Direct API calls inside controllers/services: harder to test and maintain.
- Multiple AI providers at once: too much complexity for current needs.
