// MockConversationRuntime — phase 3 driver over consultWorkflow.
//
// Drives consultations to completion, resuming each 'agent_turn' pause with the next
// caller turn from an injected StimulusSource. Turn and directive lifecycle events are
// emitted here, never by the engine, because turns are a Conversation Runtime concept,
// not a workflow node — the engine only ever produces the flat `conversation.turn`
// transcript line as a side effect of node execution (see
// documentation/conversation-runtime-design.md). 'transfer'/async-tool pauses still
// auto-resume via a system timer; a StimulusSource applies to conversational exchanges
// only.
//
// Two StimulusSource implementations exist: `scriptedStimulusSource` (default) replays
// one deterministic scenario per workflow (lib/conversation-scenarios.ts) — this is what
// "Run test" uses, unchanged from phase 3. `createInteractiveStimulusSource` resolves
// each turn from a live caller instead of a script — this is what agent testing uses
// (components/agent-testing-panel.tsx). Both drive the exact same consultWorkflow/event
// path; there is no second execution engine.
//
// `run()` never rejects. Every way a session can stop — reaching an `end` node, a
// caller hangup (cancellation), an unhandled provider exception, or exhausting
// MAX_CONSULTATIONS — resolves with a truthful `SessionEndReason`, recorded on
// `session.ended`. `runConversationSession` wraps `run()` with the run-level envelope
// (run.started / runtime.completed / run.completed) so every caller — the "Run test"
// button and the agent testing panel alike — produces an identical lifecycle shape
// instead of each reimplementing it.

import type { Workflow } from '@/lib/mock-workflows';
import {
  appendTurn,
  createInitialContext,
  setValue,
  type WorkflowContext,
} from '@/lib/workflow-context';
import type { Cursor, Directive, SessionEndReason, Stimulus } from '@/lib/conversation-types';
import { ExecutionRecorder, type RunProvenance } from '@/lib/workflow-events';
import { consultWorkflow, type ConsultationResult } from '@/lib/workflow-consultation';
import { projectContext } from '@/lib/workflow-projections';
import type { PlatformRuntime } from '@/lib/runtime/contracts';
import { getScenario, scenarioTurn, type ScriptedTurn } from '@/lib/conversation-scenarios';
import { getDefaultAgentRepository, type AgentRepository } from '@/lib/agent-repository';

// Defensive guard against a mis-modeled graph running forever in the absence of a real
// caller to break the cycle. Exported so tests can drive exhaustion deterministically
// without duplicating the constant.
export const MAX_CONSULTATIONS = 50;

/** What `nextCallerTurn` resolved with: a real turn, or a cancellation (caller hangup). */
export type StimulusOutcome = { kind: 'turn'; turn: ScriptedTurn } | { kind: 'cancelled' };

// Sources the next caller turn at each 'agent_turn' wait point.
export type StimulusSource = {
  /**
   * Non-blocking lookahead: does the *upcoming* caller turn interrupt an in-flight
   * speak? Scripted sources know this in advance (it's authored data); interactive
   * sources always report false — real interruption timing isn't modeled without live
   * audio (see documentation/agent-model-design.md §7).
   */
  peekInterrupts(scriptIndex: number): boolean;
  /** Resolves the next caller turn, or a cancellation. May await external input. */
  nextCallerTurn(scriptIndex: number): Promise<StimulusOutcome>;
};

function scriptedStimulusSource(workflowId: string): StimulusSource {
  const scenario = getScenario(workflowId);
  return {
    peekInterrupts: (scriptIndex) => scenarioTurn(scenario, scriptIndex).interrupts === true,
    nextCallerTurn: async (scriptIndex) => ({
      kind: 'turn',
      turn: scenarioTurn(scenario, scriptIndex),
    }),
  };
}

/**
 * A caller-driven source: `nextCallerTurn` doesn't resolve until `submit` or `cancel`
 * is called. Used by agent testing to let a real person stand in for the caller at each
 * 'agent_turn' pause instead of replaying a script, and to give the End action a real
 * way to unblock a pending `run()` rather than abandoning it.
 */
export function createInteractiveStimulusSource(): {
  source: StimulusSource;
  submit: (text: string) => void;
  cancel: () => void;
} {
  let resolve: ((outcome: StimulusOutcome) => void) | null = null;
  // `submit`/`cancel` may be called before `nextCallerTurn` is requested (e.g. a
  // scenario seeding the opening caller line right after the first pause, or End being
  // clicked in the brief window before the loop reaches its await point) — queue the
  // outcome so producer and consumer are order-independent instead of racing.
  let queued: StimulusOutcome | null = null;

  const resolveOrQueue = (outcome: StimulusOutcome) => {
    if (resolve) {
      const pending = resolve;
      resolve = null;
      pending(outcome);
    } else if (!queued) {
      // Once cancelled, further submits are ignored — the session is over.
      queued = outcome;
    }
  };

  return {
    source: {
      peekInterrupts: () => false,
      nextCallerTurn: () => {
        if (queued) {
          const outcome = queued;
          queued = null;
          return Promise.resolve(outcome);
        }
        return new Promise<StimulusOutcome>((res) => {
          resolve = res;
        });
      },
    },
    submit: (text: string) => resolveOrQueue({ kind: 'turn', turn: { text } }),
    cancel: () => resolveOrQueue({ kind: 'cancelled' }),
  };
}

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
    private readonly stimulusSource: StimulusSource = scriptedStimulusSource(workflow.id),
    // agentId -> pinned AgentVersion id, resolved once at session start (see
    // resolveRunProvenance/runConversationSession below) and reused for every
    // consultation this session drives. Defaults to {} for callers that construct this
    // class directly, bypassing runConversationSession (e.g. tests exercising
    // consultation/cancellation/causality mechanics, predating the Agent Model).
    private readonly pinnedAgentVersions: Record<string, string> = {},
  ) {}

  /**
   * Drives consultations to completion, resuming each pause per `stimulusSource`.
   * `onPause` fires whenever an 'agent_turn' wait point is about to await the next
   * caller turn — the interactive source uses this as its "render now" signal, since
   * `nextCallerTurn` may not resolve until external input arrives.
   *
   * Never rejects: a thrown provider exception, a cancelled interactive session, and
   * exhausting MAX_CONSULTATIONS all resolve with a truthful `endReason` rather than
   * leaving the caller's promise pending or throwing.
   */
  async run(
    initialContext: WorkflowContext,
    runStartedEventId: string | undefined,
    onPause?: (recorder: ExecutionRecorder) => void,
  ): Promise<{ context: WorkflowContext; endReason: SessionEndReason }> {
    const opened = this.recorder.emit(
      {
        type: 'session.opened',
        workflowId: this.workflow.id,
        definitionVersion: `v${this.workflow.version}`,
        channel: 'voice',
        provider: 'mock-channel',
      },
      { parentEventId: runStartedEventId },
    );

    const end = (context: WorkflowContext, reason: SessionEndReason) => {
      this.recorder.emit({ type: 'session.ended', reason }, { parentEventId: opened.eventId });
      onPause?.(this.recorder);
      return { context, endReason: reason };
    };

    let context = initialContext;
    let cursor: Cursor = { nodeId: null };
    let stimulus: Stimulus = { kind: 'session.start' };
    let causeEventId = opened.eventId;
    let scriptIndex = 0;
    let sawTransfer = false;

    try {
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
          pinnedAgentVersions: this.pinnedAgentVersions,
        });
        context = result.context;

        for (const directive of result.directives) {
          if (directive.kind === 'transfer') sawTransfer = true;
        }

        const nextIsInterrupting =
          result.status === 'paused' &&
          result.waitReason === 'agent_turn' &&
          this.stimulusSource.peekInterrupts(scriptIndex);
        this.processDirectives(result.directives, consultationId, nextIsInterrupting);

        if (result.status === 'completed') {
          return end(
            context,
            result.outcome === 'end' ? (sawTransfer ? 'transferred' : 'completed') : 'error',
          );
        }

        const paused = result.events.find((event) => event.type === 'consultation.paused');
        causeEventId = paused?.eventId ?? causeEventId;
        cursor = result.cursor;

        if (result.waitReason === 'agent_turn') {
          onPause?.(this.recorder);
          const outcome = await this.stimulusSource.nextCallerTurn(scriptIndex);
          if (outcome.kind === 'cancelled') {
            return end(context, 'caller_hangup');
          }
          scriptIndex += 1;
          const turnId = `${consultationId}-caller`;
          const recorded = this.recordCallerTurn(context, outcome.turn, consultationId, turnId);
          context = recorded.context;
          // The caller turn — not the prior pause — is what actually caused the next
          // consultation; only fall back to the pause event when no turn text was
          // recorded (an empty fallback turn recorded nothing to point at).
          causeEventId = recorded.causeEventId ?? causeEventId;
          stimulus = outcome.turn.text
            ? { kind: 'caller.turn', turnId, text: outcome.turn.text, intent: outcome.turn.intent }
            : { kind: 'timer', timerId: `${consultationId}-auto` };
        } else {
          // 'transfer' and the future 'async_tool' have no caller response to react to
          // — a system timer stands in for "resume now".
          stimulus = { kind: 'timer', timerId: `${consultationId}-auto` };
        }
      }
      return end(context, 'timeout');
    } catch {
      return end(context, 'error');
    }
  }

  /**
   * Every directive the just-finished consultation produced gets a issued/completed
   * pair, except an interruptible `speak` when the upcoming scripted turn interrupts —
   * that one is abandoned instead, and the agent's turn (already recorded via
   * `conversation.turn` by the engine) is annotated as cut off.
   */
  private processDirectives(
    directives: Directive[],
    consultationId: string,
    interruptSpeak: boolean,
  ) {
    directives.forEach((directive, index) => {
      const directiveId = `${consultationId}-d${index}`;
      this.recorder.emit(
        {
          type: 'directive.issued',
          directiveId,
          directiveKind: directive.kind,
          summary: directiveSummary(directive),
        },
        { consultationId },
      );

      if (interruptSpeak && directive.kind === 'speak' && directive.interruptible) {
        this.recorder.emit(
          { type: 'directive.abandoned', directiveId, reason: 'Interrupted by caller' },
          { consultationId },
        );
        this.recorder.emit(
          { type: 'turn.interrupted', partialText: truncateForInterruption(directive.text) },
          { consultationId },
        );
      } else {
        this.recorder.emit({ type: 'directive.completed', directiveId }, { consultationId });
      }
    });
  }

  /**
   * Caller turns aren't produced by any node executor, so this is the only place that
   * appends one to context — mirroring what the engine does for agent/system turns —
   * and it's also the only place `detected_intent` is set, so the `state.changed` event
   * is emitted manually to keep `fold(events) === context` holding. Returns the
   * `turn.completed` event's id so the caller can wire it up as the next consultation's
   * causal parent, rather than the consultation.paused event that merely preceded it.
   */
  private recordCallerTurn(
    context: WorkflowContext,
    scripted: ScriptedTurn,
    consultationId: string,
    turnId: string,
  ): { context: WorkflowContext; causeEventId?: string } {
    if (!scripted.text) return { context };
    let next = appendTurn(context, { speaker: 'caller', text: scripted.text });
    this.recorder.emit(
      { type: 'conversation.turn', speaker: 'caller', text: scripted.text },
      { consultationId, turnId },
    );
    const completed = this.recorder.emit(
      { type: 'turn.completed', speaker: 'caller', text: scripted.text },
      { consultationId, turnId },
    );

    if (scripted.intent) {
      this.recorder.emit(
        { type: 'intent.detected', intent: scripted.intent },
        { consultationId, turnId },
      );
      const from = next.metadata.detected_intent;
      next = setValue(next, { scope: 'metadata', key: 'detected_intent' }, scripted.intent);
      this.recorder.emit(
        {
          type: 'state.changed',
          scope: 'metadata',
          key: 'detected_intent',
          from,
          to: scripted.intent,
        },
        { consultationId, turnId },
      );
    }
    return { context: next, causeEventId: completed.eventId };
  }
}

// Every node whose ref names an agent — mirrors exactly the gating condition
// consultWorkflow already uses to decide whether to pre-emit agent.started (ref.type,
// not node.kind, matching that file's own miniature-duplication comment) — so this
// pre-resolves precisely the set of agent ids a real walk could ever hit.
function collectAgentIds(workflow: Workflow): string[] {
  const ids = new Set<string>();
  for (const node of workflow.nodes) {
    if (node.ref?.type === 'agent') ids.add(node.ref.id);
  }
  return [...ids];
}

/**
 * Resolves a specific, immutable AgentVersion for every agent the workflow's nodes
 * reference — once, before the session starts (Phase 2 requirement 1). Throws
 * explicitly rather than falling back to a stale or synthetic snapshot when an agent
 * doesn't exist or has never been published (Phase 2 requirement 6): a session that
 * can't resolve real provenance must fail loudly at setup, not silently misreport it
 * later as a truthful-looking but misleading runtime error.
 *
 * `agentId`/`agentVersionId` are set on the returned `RunProvenance` only when the
 * workflow references exactly one distinct agent — see EventIdentity's doc comment in
 * workflow-events.ts and agent-model-implementation-plan.md §11 risk 4. The full
 * per-agent map is always returned regardless, so multi-agent workflows still get a
 * correctly pinned version per node (via agent.started/agent.responded's own payload
 * fields), just no single run-level default.
 */
async function resolveRunProvenance(
  workflow: Workflow,
  agentRepository: AgentRepository,
): Promise<{ pinnedAgentVersions: Record<string, string>; provenance: RunProvenance }> {
  const agentIds = collectAgentIds(workflow);
  const pinnedAgentVersions: Record<string, string> = {};
  for (const agentId of agentIds) {
    const version = await agentRepository.getPublishedVersion(agentId);
    if (!version) {
      throw new Error(
        `Cannot start a session for workflow "${workflow.id}": agent "${agentId}" has no published AgentVersion. Publish the agent before running or testing this workflow.`,
      );
    }
    pinnedAgentVersions[agentId] = version.versionId;
  }

  const provenance: RunProvenance = { workflowId: workflow.id, workflowVersion: workflow.version };
  if (agentIds.length === 1) {
    provenance.agentId = agentIds[0];
    provenance.agentVersionId = pinnedAgentVersions[agentIds[0]];
  }
  return { pinnedAgentVersions, provenance };
}

/**
 * The canonical run envelope: run.started → session lifecycle (driven by
 * MockConversationRuntime) → runtime.completed → run.completed. This is the single
 * shared entry point for running a session to completion (or to whatever truthful
 * ending it reaches) — `simulateWorkflowRun` (the "Run test" button) and the agent
 * testing panel both call this rather than each assembling the envelope by hand, so
 * an interactive agent test produces the identical lifecycle shape a workflow run does.
 *
 * Also where Phase 2's runtime provenance is resolved (see resolveRunProvenance above)
 * — before `recorder` emits anything, so run.started itself already carries it.
 */
export async function runConversationSession(input: {
  workflow: Workflow;
  runtime: PlatformRuntime;
  recorder: ExecutionRecorder;
  runId: string;
  stimulusSource?: StimulusSource;
  onPause?: (recorder: ExecutionRecorder) => void;
  /** Defaults to the shared local repository singleton — see getDefaultAgentRepository. */
  agentRepository?: AgentRepository;
}): Promise<{ context: WorkflowContext; endReason: SessionEndReason }> {
  const { workflow, runtime, recorder, runId, stimulusSource, onPause } = input;
  const agentRepository = input.agentRepository ?? getDefaultAgentRepository();

  const { pinnedAgentVersions, provenance } = await resolveRunProvenance(workflow, agentRepository);
  recorder.setProvenance(provenance);

  const initial = createInitialContext(workflow.variables);
  const runStarted = recorder.emit({
    type: 'run.started',
    workflowId: workflow.id,
    initial: {
      variables: { ...initial.variables },
      session: { ...initial.session },
      metadata: { ...initial.metadata },
    },
    // The complete agentId -> pinned AgentVersion id binding, durable on the canonical
    // stream regardless of which nodes this run actually visits — see run.started's
    // payload doc comment in workflow-events.ts.
    agentVersions: pinnedAgentVersions,
  });

  const conversationRuntime = new MockConversationRuntime(
    workflow,
    runtime,
    recorder,
    runId,
    stimulusSource,
    pinnedAgentVersions,
  );
  const { endReason } = await conversationRuntime.run(initial, runStarted.eventId, onPause);

  // Derived from the event stream rather than threaded manually across consultations —
  // the whole point of an event-sourced record is that totals like this are a fold, not
  // accumulator state the driver has to carry.
  const eventsSoFar = recorder.list();
  const agentCalls = eventsSoFar.filter((event) => event.type === 'agent.responded').length;
  const toolCalls = eventsSoFar.filter((event) => event.type === 'tool.returned').length;
  const knowledgeQueries = eventsSoFar.filter(
    (event) => event.type === 'knowledge.retrieved',
  ).length;
  const totalLatencyMs = eventsSoFar.reduce((sum, event) => {
    if (
      event.type === 'agent.responded' ||
      event.type === 'knowledge.retrieved' ||
      event.type === 'tool.returned'
    )
      return sum + event.latencyMs;
    return sum;
  }, 0);

  recorder.emit(
    { type: 'runtime.completed', agentCalls, toolCalls, knowledgeQueries, totalLatencyMs },
    { parentEventId: runStarted.eventId },
  );

  const finalContext = projectContext(recorder.list());
  // A normal completion reports the workflow's own declared outcome variable when it
  // set one; any other ending (cancelled, errored, exhausted, transferred) reports its
  // truthful SessionEndReason instead of pretending the run simply finished.
  const outcome =
    endReason === 'completed' && typeof finalContext.variables.outcome === 'string'
      ? finalContext.variables.outcome
      : endReason;
  recorder.emit({ type: 'run.completed', outcome }, { parentEventId: runStarted.eventId });

  return { context: finalContext, endReason };
}
