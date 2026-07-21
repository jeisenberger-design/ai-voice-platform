// MockConversationRuntime — phase 3 driver over consultWorkflow.
//
// Drives one deterministic scripted scenario per workflow: each 'agent_turn' pause is
// resumed with a real caller line (text + optional intent) instead of phase 2's empty
// placeholder, and support-triage's scenario demonstrates an interruption. Turn and
// directive lifecycle events are emitted here, never by the engine, because turns are a
// Conversation Runtime concept, not a workflow node — the engine only ever produces the
// flat `conversation.turn` transcript line as a side effect of node execution (see
// documentation/conversation-runtime-design.md). 'transfer'/async-tool pauses still
// auto-resume via a system timer; scripting applies to conversational exchanges only.

import type { Workflow } from '@/lib/mock-workflows';
import { appendTurn, setValue, type WorkflowContext } from '@/lib/workflow-context';
import type { Cursor, Directive, Stimulus } from '@/lib/conversation-types';
import { ExecutionRecorder } from '@/lib/workflow-events';
import { consultWorkflow, type ConsultationResult } from '@/lib/workflow-consultation';
import type { PlatformRuntime } from '@/lib/runtime/contracts';
import { getScenario, scenarioTurn, type ScriptedTurn } from '@/lib/conversation-scenarios';

// Defensive guard against a mis-modeled graph running forever in the absence of a real
// caller to break the cycle.
const MAX_CONSULTATIONS = 50;

function truncateForInterruption(text: string): string {
  const sentenceEnd = text.search(/[.!?]/);
  if (sentenceEnd > 0 && sentenceEnd < 60) return text.slice(0, sentenceEnd + 1);
  if (text.length <= 8) return text;
  return `${text.slice(0, Math.ceil(text.length * 0.6))}…`;
}

function directiveSummary(directive: Directive): string {
  switch (directive.kind) {
    case 'speak':
      return directive.text;
    case 'listen':
      return directive.expecting?.join(', ') ?? 'awaiting caller';
    case 'invoke_tool':
      return directive.toolId;
    case 'transfer':
      return directive.target;
    case 'end':
      return directive.reason;
    default:
      return '';
  }
}

export class MockConversationRuntime {
  constructor(
    private readonly workflow: Workflow,
    private readonly runtime: PlatformRuntime,
    private readonly recorder: ExecutionRecorder,
    private readonly runId: string,
  ) {}

  /** Drives consultations to completion, resuming each pause per the workflow's scripted scenario. */
  async run(initialContext: WorkflowContext, runStartedEventId: string): Promise<{ context: WorkflowContext }> {
    const scenario = getScenario(this.workflow.id);
    const opened = this.recorder.emit(
      { type: 'session.opened', workflowId: this.workflow.id, definitionVersion: `v${this.workflow.version}`, channel: 'voice', provider: 'mock-channel' },
      { parentEventId: runStartedEventId },
    );

    let context = initialContext;
    let cursor: Cursor = { nodeId: null };
    let stimulus: Stimulus = { kind: 'session.start' };
    let causeEventId = opened.eventId;
    let scriptIndex = 0;

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

      const nextIsInterrupting = result.status === 'paused' && result.waitReason === 'agent_turn' && scenarioTurn(scenario, scriptIndex).interrupts === true;
      this.processDirectives(result.directives, consultationId, nextIsInterrupting);

      if (result.status === 'completed') break;

      const paused = result.events.find((event) => event.type === 'consultation.paused');
      causeEventId = paused?.eventId ?? causeEventId;
      cursor = result.cursor;

      if (result.waitReason === 'agent_turn') {
        const scripted = scenarioTurn(scenario, scriptIndex);
        scriptIndex += 1;
        context = this.recordCallerTurn(context, scripted, consultationId);
        stimulus = scripted.text
          ? { kind: 'caller.turn', turnId: `${consultationId}-caller`, text: scripted.text, intent: scripted.intent }
          : { kind: 'timer', timerId: `${consultationId}-auto` };
      } else {
        // 'transfer' and the future 'async_tool' have no scripted caller response to
        // react to — a system timer stands in for "resume now".
        stimulus = { kind: 'timer', timerId: `${consultationId}-auto` };
      }
    }

    this.recorder.emit({ type: 'session.ended', reason: 'completed' }, { parentEventId: opened.eventId });
    return { context };
  }

  /**
   * Every directive the just-finished consultation produced gets a issued/completed
   * pair, except an interruptible `speak` when the upcoming scripted turn interrupts —
   * that one is abandoned instead, and the agent's turn (already recorded via
   * `conversation.turn` by the engine) is annotated as cut off.
   */
  private processDirectives(directives: Directive[], consultationId: string, interruptSpeak: boolean) {
    directives.forEach((directive, index) => {
      const directiveId = `${consultationId}-d${index}`;
      this.recorder.emit({ type: 'directive.issued', directiveId, directiveKind: directive.kind, summary: directiveSummary(directive) }, { consultationId });

      if (interruptSpeak && directive.kind === 'speak' && directive.interruptible) {
        this.recorder.emit({ type: 'directive.abandoned', directiveId, reason: 'Interrupted by caller' }, { consultationId });
        this.recorder.emit({ type: 'turn.interrupted', partialText: truncateForInterruption(directive.text) }, { consultationId });
      } else {
        this.recorder.emit({ type: 'directive.completed', directiveId }, { consultationId });
      }
    });
  }

  /**
   * Caller turns aren't produced by any node executor, so this is the only place that
   * appends one to context — mirroring what the engine does for agent/system turns —
   * and it's also the only place `detected_intent` is set, so the `state.changed` event
   * is emitted manually to keep `fold(events) === context` holding.
   */
  private recordCallerTurn(context: WorkflowContext, scripted: ScriptedTurn, consultationId: string): WorkflowContext {
    if (!scripted.text) return context;
    let next = appendTurn(context, { speaker: 'caller', text: scripted.text });
    this.recorder.emit({ type: 'conversation.turn', speaker: 'caller', text: scripted.text }, { consultationId });
    this.recorder.emit({ type: 'turn.completed', speaker: 'caller', text: scripted.text }, { consultationId });

    if (scripted.intent) {
      this.recorder.emit({ type: 'intent.detected', intent: scripted.intent }, { consultationId });
      const from = next.metadata.detected_intent;
      next = setValue(next, { scope: 'metadata', key: 'detected_intent' }, scripted.intent);
      this.recorder.emit({ type: 'state.changed', scope: 'metadata', key: 'detected_intent', from, to: scripted.intent }, { consultationId });
    }
    return next;
  }
}
