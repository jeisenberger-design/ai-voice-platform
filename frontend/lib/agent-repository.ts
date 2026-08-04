// AgentRepository — the persistence boundary for the canonical Agent model. See
// documentation/agent-model-implementation-plan.md §7.
//
// Every product screen is meant to reach this through React Query hooks
// (hooks/use-agent-data.ts, a later phase), never LocalAgentRepository directly — the
// same seam lib/mock-api.ts already establishes for CRUD data. Swapping in a real
// backend later means implementing this interface and changing one factory function.

import type {
  Agent,
  AgentVersion,
  AgentVersionConfig,
  InstructionSection,
} from '@/lib/agent-model';
import { migrateAgents } from '@/lib/agent-migration';

// `Partial<AgentVersionConfig>` isn't deep — it would force callers to pass every
// InstructionSection even to edit one (structured-editor.tsx's updateSection today
// only ever touches one). This makes `instructions` independently partial too.
export type AgentVersionConfigPatch = Partial<Omit<AgentVersionConfig, 'instructions'>> & {
  instructions?: Partial<AgentVersionConfig['instructions']>;
};

export interface AgentRepository {
  listAgents(): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  getVersion(versionId: string): Promise<AgentVersion | null>;
  getDraft(agentId: string): Promise<AgentVersion>;
  updateDraft(agentId: string, patch: AgentVersionConfigPatch): Promise<AgentVersion>;
  listVersions(agentId: string): Promise<AgentVersion[]>; // published versions, newest first
  getPublishedVersion(agentId: string): Promise<AgentVersion | null>;
  publish(agentId: string): Promise<AgentVersion>;
  createAgent(input: { name: string; status?: Agent['status'] }): Promise<Agent>;
}

// A minimal Storage-like seam. Real browsers supply `window.localStorage`; Vitest's
// `node` test environment and Next.js Server Components don't have one at all, so
// LocalAgentRepository falls back to an in-memory implementation rather than crashing.
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function defaultStorage(): KeyValueStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return new MemoryStorage();
}

const STORAGE_KEY = 'relay-agent-repository-v1';

type PersistedShape = {
  agents: Record<string, Agent>;
  versions: Record<string, AgentVersion>;
};

const emptyInstructions: Record<InstructionSection, string> = {
  Identity: '',
  Description: '',
  Purpose: '',
  Personality: '',
  Language: '',
  'Behavior Rules': '',
  'Conversation Rules': '',
  Knowledge: '',
  Tools: '',
  Transfers: '',
  Memory: '',
  Guardrails: '',
  'Output Format': '',
  'Output Schema': '',
};

function emptyVersionConfig(): AgentVersionConfig {
  return {
    instructions: { ...emptyInstructions },
    voice: '',
    model: '',
    workflowIds: [],
    knowledgeSourceIds: [],
    toolIds: [],
    transferPolicy: '',
    memory: '',
    guardrails: '',
    outputSchema: '',
  };
}

export class LocalAgentRepository implements AgentRepository {
  private agents: Record<string, Agent>;
  private versions: Record<string, AgentVersion>;
  private readonly storage: KeyValueStorage;
  private readonly clock: () => number;
  private nextAgentSeq = 1;

  constructor(options: { storage?: KeyValueStorage; clock?: () => number } = {}) {
    this.storage = options.storage ?? defaultStorage();
    let seq = 0;
    this.clock = options.clock ?? (() => seq++);

    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedShape;
      this.agents = parsed.agents;
      this.versions = parsed.versions;
    } else {
      const seeded = migrateAgents();
      this.agents = Object.fromEntries(seeded.agents.map((a) => [a.agentId, a]));
      this.versions = Object.fromEntries(seeded.versions.map((v) => [v.versionId, v]));
      this.persist();
    }
  }

  private persist(): void {
    const shape: PersistedShape = { agents: this.agents, versions: this.versions };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(shape));
  }

  private async requireAgent(agentId: string): Promise<Agent> {
    const agent = this.agents[agentId];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    return agent;
  }

  async listAgents(): Promise<Agent[]> {
    return Object.values(this.agents);
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agents[agentId] ?? null;
  }

  async getVersion(versionId: string): Promise<AgentVersion | null> {
    return this.versions[versionId] ?? null;
  }

  async getDraft(agentId: string): Promise<AgentVersion> {
    const agent = await this.requireAgent(agentId);
    const draft = this.versions[agent.draftVersionId];
    if (!draft) throw new Error(`Missing draft for agent: ${agentId}`);
    return draft;
  }

  async updateDraft(agentId: string, patch: AgentVersionConfigPatch): Promise<AgentVersion> {
    const draft = await this.getDraft(agentId);
    const updated: AgentVersion = {
      ...draft,
      ...patch,
      instructions: patch.instructions
        ? { ...draft.instructions, ...patch.instructions }
        : draft.instructions,
    };
    this.versions[draft.versionId] = updated;
    this.persist();
    return updated;
  }

  async listVersions(agentId: string): Promise<AgentVersion[]> {
    return Object.values(this.versions)
      .filter((v) => v.agentId === agentId && v.status === 'published')
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async getPublishedVersion(agentId: string): Promise<AgentVersion | null> {
    const agent = await this.requireAgent(agentId);
    if (!agent.publishedVersionId) return null;
    return this.versions[agent.publishedVersionId] ?? null;
  }

  async publish(agentId: string): Promise<AgentVersion> {
    const agent = await this.requireAgent(agentId);
    const draft = await this.getDraft(agentId);
    const published = await this.listVersions(agentId);
    const nextVersionNumber = 1 + published.reduce((max, v) => Math.max(max, v.versionNumber), 0);
    const versionId = `${agentId}-v${nextVersionNumber}`;

    const newVersion: AgentVersion = {
      ...draft,
      versionId,
      agentId,
      versionNumber: nextVersionNumber,
      status: 'published',
      createdAt: this.clock(),
      publishedAt: this.clock(),
    };

    this.versions[versionId] = newVersion;
    this.agents[agentId] = { ...agent, publishedVersionId: versionId };
    this.persist();
    return newVersion;
  }

  async createAgent(input: { name: string; status?: Agent['status'] }): Promise<Agent> {
    const agentId = `agent_${this.nextAgentSeq++}`;
    const draftVersionId = `${agentId}-draft`;
    const draft: AgentVersion = {
      ...emptyVersionConfig(),
      versionId: draftVersionId,
      agentId,
      versionNumber: 0,
      status: 'draft',
      createdAt: this.clock(),
    };
    const agent: Agent = {
      agentId,
      name: input.name,
      status: input.status ?? 'Draft',
      draftVersionId,
      createdAt: this.clock(),
    };
    this.versions[draftVersionId] = draft;
    this.agents[agentId] = agent;
    this.persist();
    return agent;
  }
}

// Shared, lazily-constructed singleton — so callers that don't inject their own
// repository (real app usage, not tests) all resolve against the same localStorage-
// backed state, the same way nextRunId/nextSessionId are shared module-level counters
// elsewhere in this codebase. Tests should always inject their own instance (with an
// explicit storage/clock) rather than relying on this singleton, to stay isolated from
// each other.
let defaultRepository: AgentRepository | undefined;
export function getDefaultAgentRepository(): AgentRepository {
  if (!defaultRepository) defaultRepository = new LocalAgentRepository();
  return defaultRepository;
}
