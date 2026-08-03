// Workflow graph model — the platform's orchestration layer.
//
// A workflow is a directed graph of typed nodes. Node kinds intentionally map to the
// platform's other domains (agents, tools, knowledge) so a workflow orchestrates those
// resources rather than re-defining them. Tool nodes bind workflow state to typed tool
// inputs/outputs; decision edges carry structured predicates. This model is runtime-
// agnostic — see lib/workflow-executors.ts and lib/workflow-execution.ts for execution.

import type { Operand, TriggerSeed, VarRef, WorkflowVariable } from '@/lib/workflow-context';
import type { Predicate } from '@/lib/workflow-predicates';

export type WorkflowNodeKind =
  'trigger' | 'agent' | 'tool' | 'knowledge' | 'decision' | 'transfer' | 'message' | 'end';

export type WorkflowNodeRef = { type: 'agent' | 'tool' | 'knowledge'; id: string };

// Maps a workflow value/expression into a named tool input parameter.
export type InputBinding = { param: string; source: Operand };
// Maps a named tool output back into workflow state.
export type OutputMapping = { output: string; target: VarRef };

export type WorkflowNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  description?: string;
  ref?: WorkflowNodeRef;
  position: { x: number; y: number };
  seed?: TriggerSeed;
  inputBindings?: InputBinding[];
  outputMappings?: OutputMapping[];
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: Predicate;
  else?: boolean;
};

export type WorkflowStatus = 'Live' | 'Draft' | 'Paused';

export type Workflow = {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  trigger: string;
  version: number;
  variables: WorkflowVariable[];
  agentIds: string[];
  toolIds: string[];
  knowledgeSources: string[];
  runsThisMonth: number;
  successRate: number;
  avgDuration: string;
  updated: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

// Small builders keep fixture predicates/bindings readable.
const v = (key: string): VarRef => ({ scope: 'variables', key });
const sess = (key: string): VarRef => ({ scope: 'session', key });
const refOp = (ref: VarRef): Operand => ({ kind: 'ref', ref });
const lit = (value: string | number | boolean): Operand => ({ kind: 'literal', value });

const salesQualification: Pick<Workflow, 'variables' | 'nodes' | 'edges'> = {
  variables: [
    { name: 'customer_status', type: 'string', description: 'Set by the CRM lookup.' },
    { name: 'lead_id', type: 'string', description: 'Set when a new lead is created.' },
    { name: 'outcome', type: 'string', description: 'Final call outcome.' },
  ],
  nodes: [
    {
      id: 'n1',
      kind: 'trigger',
      label: 'Inbound call',
      description: 'Sales line',
      position: { x: 300, y: 20 },
      seed: { session: { channel: 'Voice', callerPhone: '555-0142' } },
    },
    {
      id: 'n2',
      kind: 'agent',
      label: 'Avery greets caller',
      ref: { type: 'agent', id: 'a1' },
      position: { x: 300, y: 130 },
    },
    {
      id: 'n3',
      kind: 'tool',
      label: 'CRM lookup',
      ref: { type: 'tool', id: 'tool_crm_lookup' },
      position: { x: 300, y: 240 },
      inputBindings: [{ param: 'phone', source: refOp(sess('callerPhone')) }],
      outputMappings: [{ output: 'customer_status', target: v('customer_status') }],
    },
    { id: 'n4', kind: 'decision', label: 'Existing customer?', position: { x: 300, y: 350 } },
    {
      id: 'n5',
      kind: 'knowledge',
      label: 'Answer from knowledge',
      ref: { type: 'knowledge', id: 'support-knowledge-base' },
      position: { x: 40, y: 470 },
    },
    {
      id: 'n6',
      kind: 'tool',
      label: 'Create lead',
      ref: { type: 'tool', id: 'tool_create_lead' },
      position: { x: 560, y: 470 },
      inputBindings: [
        { param: 'name', source: lit('Prospect') },
        { param: 'priority', source: lit('High') },
      ],
      outputMappings: [{ output: 'lead_id', target: v('lead_id') }],
    },
    { id: 'n7', kind: 'transfer', label: 'Book with scheduling', position: { x: 300, y: 590 } },
    { id: 'n8', kind: 'end', label: 'Call summary', position: { x: 300, y: 700 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    {
      id: 'e4',
      source: 'n4',
      target: 'n6',
      label: 'New',
      condition: { left: refOp(v('customer_status')), op: '==', right: lit('new') },
    },
    { id: 'e5', source: 'n4', target: 'n5', label: 'Existing', else: true },
    { id: 'e6', source: 'n6', target: 'n7' },
    { id: 'e7', source: 'n5', target: 'n7' },
    { id: 'e8', source: 'n7', target: 'n8' },
  ],
};

const supportTriage: Pick<Workflow, 'variables' | 'nodes' | 'edges'> = {
  variables: [
    { name: 'urgency', type: 'string', description: 'Triage signal from the inbound call.' },
    { name: 'outcome', type: 'string', description: 'Final call outcome.' },
  ],
  nodes: [
    {
      id: 'n1',
      kind: 'trigger',
      label: 'Inbound call',
      description: 'Support line',
      position: { x: 300, y: 20 },
      seed: {
        session: { channel: 'Voice', callerPhone: '555-0114' },
        variables: { urgency: 'high' },
      },
    },
    {
      id: 'n2',
      kind: 'agent',
      label: 'Morgan handles caller',
      ref: { type: 'agent', id: 'a2' },
      position: { x: 300, y: 130 },
    },
    {
      id: 'n3',
      kind: 'knowledge',
      label: 'Retrieve support answer',
      ref: { type: 'knowledge', id: 'support-knowledge-base' },
      position: { x: 300, y: 240 },
    },
    { id: 'n4', kind: 'decision', label: 'Urgent issue?', position: { x: 300, y: 350 } },
    {
      id: 'n5',
      kind: 'transfer',
      label: 'Transfer to care team',
      ref: { type: 'tool', id: 'tool_transfer_billing' },
      position: { x: 40, y: 470 },
      inputBindings: [{ param: 'reason', source: lit('Urgent care escalation') }],
    },
    { id: 'n6', kind: 'message', label: 'Resolve and confirm', position: { x: 560, y: 470 } },
    { id: 'n7', kind: 'end', label: 'Call summary', position: { x: 300, y: 590 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    {
      id: 'e4',
      source: 'n4',
      target: 'n5',
      label: 'Urgent',
      condition: { left: refOp(v('urgency')), op: '==', right: lit('high') },
    },
    { id: 'e5', source: 'n4', target: 'n6', label: 'Routine', else: true },
    { id: 'e6', source: 'n5', target: 'n7' },
    { id: 'e7', source: 'n6', target: 'n7' },
  ],
};

const afterHoursVoicemail: Pick<Workflow, 'variables' | 'nodes' | 'edges'> = {
  variables: [
    {
      name: 'callback_id',
      type: 'string',
      description: 'Set when the callback request is captured.',
    },
    { name: 'outcome', type: 'string', description: 'Final call outcome.' },
  ],
  nodes: [
    {
      id: 'n1',
      kind: 'trigger',
      label: 'After-hours call',
      position: { x: 300, y: 20 },
      seed: { session: { channel: 'Voice', callerPhone: '555-0185' } },
    },
    { id: 'n2', kind: 'message', label: 'Play after-hours greeting', position: { x: 300, y: 130 } },
    {
      id: 'n3',
      kind: 'tool',
      label: 'Capture callback request',
      ref: { type: 'tool', id: 'tool_send_followup' },
      position: { x: 300, y: 240 },
      inputBindings: [
        { param: 'contact_id', source: lit('CU-311') },
        { param: 'message', source: lit('Callback requested') },
      ],
      outputMappings: [{ output: 'message_id', target: v('callback_id') }],
    },
    { id: 'n4', kind: 'end', label: 'Voicemail summary', position: { x: 300, y: 350 } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
};

export const workflows: Workflow[] = [
  {
    id: 'wf_sales_qualification',
    name: 'Inbound Sales Qualification',
    description:
      'Greets inbound prospects, checks the CRM, and either books a consultation or captures a new lead.',
    status: 'Live',
    trigger: 'Inbound call · Sales line',
    version: 7,
    agentIds: ['a1'],
    toolIds: ['tool_crm_lookup', 'tool_create_lead'],
    knowledgeSources: ['Support knowledge base'],
    runsThisMonth: 1284,
    successRate: 94.8,
    avgDuration: '4m 18s',
    updated: 'Jul 15, 2026',
    ...salesQualification,
  },
  {
    id: 'wf_support_triage',
    name: 'Support Triage',
    description:
      'Answers tier-one questions from knowledge and escalates urgent issues to the care team.',
    status: 'Live',
    trigger: 'Inbound call · Support line',
    version: 4,
    agentIds: ['a2'],
    toolIds: ['tool_transfer_billing'],
    knowledgeSources: ['Support knowledge base'],
    runsThisMonth: 867,
    successRate: 91.2,
    avgDuration: '3m 42s',
    updated: 'Jul 14, 2026',
    ...supportTriage,
  },
  {
    id: 'wf_after_hours',
    name: 'After-hours Voicemail',
    description: 'Handles calls outside business hours and captures a structured callback request.',
    status: 'Draft',
    trigger: 'Inbound call · After hours',
    version: 2,
    agentIds: [],
    toolIds: ['tool_send_followup'],
    knowledgeSources: [],
    runsThisMonth: 0,
    successRate: 0,
    avgDuration: '1m 12s',
    updated: 'Jul 11, 2026',
    ...afterHoursVoicemail,
  },
];

const wait = () => new Promise((resolve) => setTimeout(resolve, 120));
export async function mockWorkflows() {
  await wait();
  return workflows;
}
export async function mockWorkflow(id: string) {
  await wait();
  return workflows.find((workflow) => workflow.id === id) ?? null;
}
