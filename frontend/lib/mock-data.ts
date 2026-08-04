// As of Phase 2 (documentation/agent-model-implementation-plan.md), MockAgentRuntime no
// longer resolves through this fixture at all — it resolves the canonical AgentVersion
// (lib/agent-model.ts) via AgentRepository. This type/array remain read by UI screens
// only (agents list/detail, agent testing panel's display fields); migrating those onto
// the repository is Phase 3, not yet done.
export type Agent = {
  id: string;
  name: string;
  purpose: string;
  voice: string;
  promptVersion: string;
  model: string;
  calls: number;
  successRate: number;
  status: 'Active' | 'Draft' | 'Paused';
  updated: string;
};
export const agents: Agent[] = [
  {
    id: 'a1',
    name: 'Avery · Sales',
    purpose: 'Qualifies inbound prospects',
    voice: 'Nova',
    promptVersion: 'v14',
    model: 'claude-sonnet-5',
    calls: 1284,
    successRate: 94.8,
    status: 'Active',
    updated: '12 min ago',
  },
  {
    id: 'a2',
    name: 'Morgan · Support',
    purpose: 'Resolves tier-one support',
    voice: 'Alloy',
    promptVersion: 'v12',
    model: 'claude-sonnet-5',
    calls: 867,
    successRate: 91.2,
    status: 'Active',
    updated: '1 hr ago',
  },
  {
    id: 'a3',
    name: 'Jordan · Scheduling',
    purpose: 'Books consultations',
    voice: 'Shimmer',
    promptVersion: 'v8',
    model: 'claude-sonnet-5',
    calls: 512,
    successRate: 96.1,
    status: 'Paused',
    updated: 'Yesterday',
  },
  {
    id: 'a4',
    name: 'Onboarding Concierge',
    purpose: 'Guides new customers',
    voice: 'Echo',
    promptVersion: 'v1',
    model: 'claude-haiku-4-5',
    calls: 0,
    successRate: 0,
    status: 'Draft',
    updated: 'Jul 10',
  },
];
export const metrics = [
  { label: 'Total calls', value: '2,663', change: '+18.4%', icon: 'PhoneCall' },
  { label: 'Active agents', value: '12', change: '+2 this month', icon: 'Bot' },
  { label: 'Success rate', value: '93.7%', change: '+1.2%', icon: 'CircleCheck' },
  { label: 'Average duration', value: '4m 32s', change: '-24 sec', icon: 'Clock' },
  { label: 'Transfers', value: '184', change: '6.9% of calls', icon: 'ArrowRightLeft' },
];
export const activity = [
  {
    title: 'Avery completed a lead qualification',
    detail: 'Qualified · 4m 18s',
    time: '2 min ago',
  },
  { title: 'Knowledge source indexed', detail: 'Pricing-FAQ.pdf · 14 pages', time: '18 min ago' },
  { title: 'Morgan was updated', detail: 'Prompt version 12 published', time: '1 hr ago' },
  { title: 'Transfer completed', detail: 'Support → billing queue', time: '2 hr ago' },
];
// `id` is the stable, opaque identity — `name` is an editable display value and must
// never be used as identity (see documentation/agent-model-implementation-plan.md §1).
export const sources = [
  {
    id: 'ks1',
    name: 'Customer onboarding guide.pdf',
    type: 'PDF',
    chunks: 84,
    updated: 'Jul 14, 2026',
  },
  {
    id: 'ks2',
    name: 'Support knowledge base',
    type: 'Web sync',
    chunks: 312,
    updated: 'Jul 13, 2026',
  },
  { id: 'ks3', name: 'Pricing FAQ.docx', type: 'DOCX', chunks: 42, updated: 'Jul 9, 2026' },
];
export const weeklyCalls = [520, 610, 570, 730, 680, 820, 760];
