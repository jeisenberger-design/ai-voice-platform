# Current product state

## Phase 1C completed — Calls Intelligence Workspace

The frontend now includes a complete mock-data call operations experience. It remains frontend-only: no API routes, persistence, recordings, or telephony services have been introduced.

### New pages

- `/calls` provides performance metrics, agent comparison, intent analysis, call search, filters, and an operational call table.
- `/calls/[id]` provides a detailed call-review workspace with header metrics, searchable transcript, event timeline, extracted structured data, and quality evaluation.

### Components added

- `components/calls/call-filters.tsx`
- `components/calls/call-table.tsx`
- `components/calls/call-detail.tsx`
- `components/calls/transcript-viewer.tsx`
- `components/calls/call-timeline.tsx`
- `components/calls/extracted-data-panel.tsx`
- `components/calls/quality-score-card.tsx`
- `components/calls/performance-dashboard.tsx`

### Mock data and state

`lib/mock-calls.ts` defines typed call records with caller information, outcomes, transcript segments, timeline events, extracted fields, cost estimates, and quality evaluation results. It exports `mockCalls`, `mockCall`, and `mockCallPerformance`, which form the replacement point for a future API client.

`stores/calls-store.ts` owns presentation filters, while React Query hooks in `hooks/use-platform-data.ts` cache the server-shaped mock records.

### Future backend API requirements

The expected integration boundary is:

- `GET /api/calls` for paginated calls and supported filter facets.
- `GET /api/calls/:id` for transcript, events, extracted data, cost, and quality results.
- `GET /api/calls/performance` for aggregate metrics, agent comparison, and intent analysis.
- Future evaluator jobs may provide detailed quality rubrics, retriable evaluation state, and human-review overrides.

All UI components are designed to retain their current query and prop boundaries when these mock service functions are replaced.
