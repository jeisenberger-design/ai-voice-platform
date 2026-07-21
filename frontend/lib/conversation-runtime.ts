// MockConversationRuntime — phase 2 driver over consultWorkflow.
//
// This is deliberately minimal: it repeatedly consults the workflow and auto-resumes
// every wait point with a placeholder stimulus, so a full session can still run to
// completion in one call. That preserves today's single-shot run experience while the
// engine's primitive becomes consultation-based underneath. Nothing here models real
// conversation behavior — no scripted caller turns, no interruption. Phase 3 replaces
// `syntheticStimulus` with scripted, deterministic multi-turn scenarios (see
// documentation/conversation-runtime-design.md).

import type { Workflow } from '@/lib/mock-workflows';
import type { WorkflowContext } from '@/lib/workflow-context';
import type { Cursor, Stimulus } from '@/lib/conversation-types';
import { ExecutionRecorder } from '@/lib/workflow-events';
import { consultWorkflow, type ConsultationResult } from '@/lib/workflow-consultation';
import type { PlatformRuntime } from '@/lib/runtime/contracts';

// Defensive guard against a mis-modeled graph (e.g. a wait point whose resumption loops
// back on itself) running forever in the absence of a real caller to break the cycle.
const MAX_CONSULTATIONS = 50;

export class MockConversationRuntime {
  constructor(
    private readonly workflow: Workflow,
    private readonly runtime: PlatformRuntime,
    private readonly recorder: ExecutionRecorder,
    private readonly runId: string,
  ) {}

  /** Drives consultations to completion, auto-resuming every pause. */
  async run(initialContext: WorkflowContext, runStartedEventId: string): Promise<{ context: WorkflowContext }> {
    let context = initialContext;
    let cursor: Cursor = { nodeId: null };
    let stimulus: Stimulus = { kind: 'session.start' };
    let causeEventId = runStartedEventId;

    for (let index = 0; index < MAX_CONSULTATIONS; index += 1) {
      const consultationId = `${this.runId}-c${index.toString().padStart(2, '0')}`;
      const result: ConsultationResult = await consultWorkflow({
        workflow: this.workflow,
        context,
        stimulus,
        cursor,
        runtime: this.runtime,
        recorder: this.recorder,
        runId: this.runId,
        consultationId,
        causeEventId,
      });
      context = result.context;
      if (result.status === 'completed') return { context };

      // The prior pause becomes this resumption's cause — a real causal chain, not a
      // synthesized one, since consultation.paused already carries the cursor.
      const paused = result.events.find((event) => event.type === 'consultation.paused');
      causeEventId = paused?.eventId ?? causeEventId;
      cursor = result.cursor;
      stimulus = this.syntheticStimulus(result, consultationId);
    }
    return { context };
  }

  private syntheticStimulus(result: ConsultationResult, consultationId: string): Stimulus {
    if (result.waitReason === 'agent_turn') {
      return { kind: 'caller.turn', turnId: `${consultationId}-auto`, text: '' };
    }
    // Covers 'transfer' and the future 'async_tool' — neither has a scripted caller
    // response to react to yet, so a generic system timer stands in for "resume now".
    return { kind: 'timer', timerId: `${consultationId}-auto` };
  }
}
