export type CallOutcome =
  | 'Appointment Request'
  | 'Qualified Lead'
  | 'Resolved'
  | 'Transferred'
  | 'Emergency Escalation'
  | 'No Match';
export type TransferStatus = 'No' | 'Yes - Billing' | 'Yes - Care team';
export type TranscriptEntry = {
  time: string;
  speaker: 'Agent' | 'Caller' | 'System';
  text: string;
  event?: boolean;
};
export type CallRecord = {
  id: string;
  caller: { name: string; phone: string };
  agent: string;
  startedAt: string;
  dateLabel: string;
  duration: string;
  durationSeconds: number;
  outcome: CallOutcome;
  language: string;
  transfer: TransferStatus;
  qualityScore: number;
  cost: string;
  intent: string;
  urgency: boolean;
  collected: Record<string, string>;
  transcript: TranscriptEntry[];
  timeline: Array<{ time: string; title: string; detail: string }>;
  quality: { greeting: string; informationCapture: string; tone: string; resolution: string };
};
const johnTranscript: TranscriptEntry[] = [
  { time: '00:00', speaker: 'System', text: 'Call started', event: true },
  {
    time: '00:03',
    speaker: 'Agent',
    text: 'Hi, thank you for calling Acme Healthcare. This is Emma. How can I help you today?',
  },
  {
    time: '00:15',
    speaker: 'Caller',
    text: 'I need help finding home care for my mother. We are not sure where to start.',
  },
  {
    time: '00:42',
    speaker: 'Agent',
    text: 'I can help with that. May I ask which services you are looking for and when you would like care to begin?',
  },
  { time: '01:30', speaker: 'System', text: 'Knowledge lookup: Home care services', event: true },
  {
    time: '01:44',
    speaker: 'Caller',
    text: 'She needs help a few days a week, ideally starting next month.',
  },
  {
    time: '02:16',
    speaker: 'Agent',
    text: 'Thank you. I can arrange a consultation with our care team. What is the best number and time to reach you?',
  },
  { time: '03:10', speaker: 'System', text: 'Structured data collection completed', event: true },
  {
    time: '04:12',
    speaker: 'Caller',
    text: 'Afternoons are best. My number is the one I called from.',
  },
  {
    time: '04:32',
    speaker: 'Agent',
    text: 'Perfect. I have requested a care consultation and the team will call you this afternoon. Is there anything else I can help with?',
  },
];
const baseCalls: Omit<
  CallRecord,
  | 'id'
  | 'caller'
  | 'agent'
  | 'startedAt'
  | 'dateLabel'
  | 'duration'
  | 'durationSeconds'
  | 'outcome'
  | 'language'
  | 'transfer'
  | 'qualityScore'
  | 'cost'
  | 'intent'
  | 'urgency'
> = {
  collected: {
    name: 'John Smith',
    phone: '555-555-5555',
    patient_name: 'Margaret Smith',
    reason: 'Home care inquiry',
    callback_time: 'Weekday afternoons',
  },
  transcript: johnTranscript,
  timeline: [
    { time: '00:00', title: 'Call started', detail: 'Inbound call received' },
    { time: '00:03', title: 'Greeting completed', detail: 'Agent identity and consent delivered' },
    { time: '00:42', title: 'Intent identified', detail: 'Home care inquiry' },
    { time: '01:30', title: 'Knowledge lookup', detail: 'Home care services source queried' },
    { time: '03:10', title: 'Data collection completed', detail: '5 required fields captured' },
    { time: '04:32', title: 'Call completed', detail: 'Appointment request created' },
  ],
  quality: {
    greeting: 'Passed',
    informationCapture: 'Passed',
    tone: 'Excellent',
    resolution: 'Passed',
  },
};
export const callRecords: CallRecord[] = [
  {
    id: 'call_01J3K9A7F4',
    caller: { name: 'John Smith', phone: '555-555-5555' },
    agent: 'Emma Healthcare Assistant',
    startedAt: '2026-07-15T10:14:00',
    dateLabel: 'Jul 15, 10:14 AM',
    duration: '04:32',
    durationSeconds: 272,
    outcome: 'Appointment Request',
    language: 'English (US)',
    transfer: 'No',
    qualityScore: 94,
    cost: '$0.42',
    intent: 'Home care inquiry',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3K87VQ2',
    caller: { name: 'Maria Garcia', phone: '555-555-0198' },
    agent: 'Emma Healthcare Assistant',
    startedAt: '2026-07-15T09:41:00',
    dateLabel: 'Jul 15, 9:41 AM',
    duration: '06:08',
    durationSeconds: 368,
    outcome: 'Qualified Lead',
    language: 'Spanish',
    transfer: 'No',
    qualityScore: 91,
    cost: '$0.56',
    intent: 'Care assessment',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3K6T8X1',
    caller: { name: 'Robert Chen', phone: '555-555-0142' },
    agent: 'Morgan Support',
    startedAt: '2026-07-15T09:05:00',
    dateLabel: 'Jul 15, 9:05 AM',
    duration: '03:18',
    durationSeconds: 198,
    outcome: 'Transferred',
    language: 'English (US)',
    transfer: 'Yes - Billing',
    qualityScore: 89,
    cost: '$0.31',
    intent: 'Billing question',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3K5PPM0',
    caller: { name: 'Aisha Patel', phone: '555-555-0167' },
    agent: 'Emma Healthcare Assistant',
    startedAt: '2026-07-14T16:24:00',
    dateLabel: 'Jul 14, 4:24 PM',
    duration: '05:41',
    durationSeconds: 341,
    outcome: 'Resolved',
    language: 'English (US)',
    transfer: 'No',
    qualityScore: 96,
    cost: '$0.52',
    intent: 'Scheduling',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3K4MDN9',
    caller: { name: 'David Williams', phone: '555-555-0121' },
    agent: 'Morgan Support',
    startedAt: '2026-07-14T14:12:00',
    dateLabel: 'Jul 14, 2:12 PM',
    duration: '02:49',
    durationSeconds: 169,
    outcome: 'Transferred',
    language: 'English (US)',
    transfer: 'Yes - Care team',
    qualityScore: 87,
    cost: '$0.26',
    intent: 'Emergency assistance',
    urgency: true,
    ...baseCalls,
  },
  {
    id: 'call_01J3K2BLS8',
    caller: { name: 'Sofia Martinez', phone: '555-555-0173' },
    agent: 'Jordan Scheduling',
    startedAt: '2026-07-14T11:38:00',
    dateLabel: 'Jul 14, 11:38 AM',
    duration: '03:54',
    durationSeconds: 234,
    outcome: 'Appointment Request',
    language: 'Spanish',
    transfer: 'No',
    qualityScore: 95,
    cost: '$0.37',
    intent: 'Scheduling',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3K1XZP7',
    caller: { name: 'Michael Brown', phone: '555-555-0114' },
    agent: 'Avery Sales',
    startedAt: '2026-07-13T15:09:00',
    dateLabel: 'Jul 13, 3:09 PM',
    duration: '07:22',
    durationSeconds: 442,
    outcome: 'Qualified Lead',
    language: 'English (US)',
    transfer: 'No',
    qualityScore: 92,
    cost: '$0.68',
    intent: 'General questions',
    urgency: false,
    ...baseCalls,
  },
  {
    id: 'call_01J3JZQMR6',
    caller: { name: 'Linda Davis', phone: '555-555-0185' },
    agent: 'Emma Healthcare Assistant',
    startedAt: '2026-07-13T12:50:00',
    dateLabel: 'Jul 13, 12:50 PM',
    duration: '01:47',
    durationSeconds: 107,
    outcome: 'No Match',
    language: 'English (US)',
    transfer: 'No',
    qualityScore: 83,
    cost: '$0.18',
    intent: 'Support',
    urgency: false,
    ...baseCalls,
  },
];
const wait = () => new Promise((resolve) => setTimeout(resolve, 120));
export async function mockCalls() {
  await wait();
  return callRecords;
}
export async function mockCall(id: string) {
  await wait();
  return callRecords.find((call) => call.id === id) ?? null;
}
export async function mockCallPerformance() {
  await wait();
  return {
    metrics: [
      ['Total Calls', '2,663', '+18.4%'],
      ['Success Rate', '93.7%', '+1.2%'],
      ['Average Duration', '4m 32s', '-24 sec'],
      ['Transfer Rate', '6.9%', '-0.8%'],
      ['Avg Quality', '92.4', '+2.1'],
    ],
    agents: [
      ['Emma Healthcare Assistant', '1,284', '94.8%', '4m 18s', '5.2%', '94'],
      ['Morgan Support', '867', '91.2%', '3m 42s', '9.8%', '89'],
      ['Jordan Scheduling', '512', '96.1%', '3m 56s', '3.1%', '95'],
    ],
    intents: [
      ['Scheduling', 38],
      ['Billing', 22],
      ['Support', 18],
      ['Emergency', 8],
      ['General Questions', 14],
    ],
  };
}
