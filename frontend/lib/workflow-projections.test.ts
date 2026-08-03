import { beforeEach, describe, expect, it } from 'vitest';
import { projectTurns } from '@/lib/workflow-projections';
import type { EventIdentity, ExecutionEvent, ExecutionEventPayload } from '@/lib/workflow-events';

// Minimal event builder — fills in the EventIdentity fields every ExecutionEvent needs
// so each test can focus on the payload that actually matters to it. Defaults every
// event into the same consultation unless a test overrides it, since that's the real
// correlator projectTurns uses (see workflow-projections.ts).
let seq = 0;
beforeEach(() => {
  seq = 0;
});

function event(
  payload: ExecutionEventPayload,
  overrides: Partial<EventIdentity> = {},
): ExecutionEvent {
  const s = overrides.seq ?? seq++;
  const identity: EventIdentity = {
    schemaVersion: 1,
    sessionId: 'sess_test',
    runId: 'run_test',
    eventId: `run_test-e${s.toString().padStart(3, '0')}`,
    seq: s,
    t: s * 20,
    emittedAt: 0,
    durability: 'canonical',
    consultationId: 'run_test-c00',
    ...overrides,
  };
  return { ...identity, ...payload };
}

describe('projectTurns', () => {
  it('projects a normal completed turn from conversation.turn + turn.completed', () => {
    const events = [
      event({ type: 'conversation.turn', speaker: 'caller', text: 'Hello there' }),
      event({ type: 'turn.completed', speaker: 'caller', text: 'Hello there' }),
    ];

    const turns = projectTurns(events);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      sessionId: 'sess_test',
      speaker: 'caller',
      text: 'Hello there',
      status: 'completed',
    });
    // Neither event carries these — must be represented as absent, not invented.
    expect(turns[0].turnId).toBeUndefined();
    expect(turns[0].origin).toBeUndefined();
    expect(turns[0].partialText).toBeUndefined();
  });

  it('marks a turn interrupted, preserving both the full text and the partial delivery', () => {
    const events = [
      event({ type: 'conversation.turn', speaker: 'agent', text: 'Morgan handles caller' }),
      event({ type: 'directive.abandoned', directiveId: 'd0', reason: 'Interrupted by caller' }),
      event({ type: 'turn.interrupted', partialText: 'Morgan handle…' }),
    ];

    const turns = projectTurns(events);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      speaker: 'agent',
      text: 'Morgan handles caller', // full text from conversation.turn, still present
      status: 'interrupted',
      partialText: 'Morgan handle…', // what was actually delivered, from turn.interrupted
    });
    expect(turns[0].interruptedBy).toBeUndefined();
  });

  it('lets directive.abandoned alone mark a turn interrupted, without inventing partial text', () => {
    const events = [
      event({ type: 'conversation.turn', speaker: 'agent', text: 'Some greeting' }),
      event({ type: 'directive.abandoned', directiveId: 'd0', reason: 'Interrupted by caller' }),
      // No turn.interrupted follows — partialText genuinely isn't available.
    ];

    const turns = projectTurns(events);

    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe('interrupted');
    expect(turns[0].partialText).toBeUndefined();
  });

  it('attaches detected intent (and confidence, when present) to the current turn', () => {
    const events = [
      event({ type: 'conversation.turn', speaker: 'caller', text: 'I need help with billing' }),
      event({ type: 'intent.detected', intent: 'billing_inquiry', confidence: 0.87 }),
    ];

    const turns = projectTurns(events);

    expect(turns).toHaveLength(1);
    expect(turns[0].intent).toBe('billing_inquiry');
    expect(turns[0].intentConfidence).toBe(0.87);
    expect(turns[0].status).toBe('completed'); // unaffected by intent detection
  });

  it('does not attribute a decorating event to a turn from a different consultation', () => {
    const events = [
      event(
        { type: 'conversation.turn', speaker: 'agent', text: 'First consultation turn' },
        { consultationId: 'run_test-c00' },
      ),
      // A decorating event tagged to an unrelated consultation must not reach back
      // into the turn opened above.
      event({ type: 'intent.detected', intent: 'unrelated' }, { consultationId: 'run_test-c01' }),
    ];

    const turns = projectTurns(events);

    expect(turns).toHaveLength(1);
    expect(turns[0].intent).toBeUndefined();
  });
});
