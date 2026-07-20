'use client';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';

export type BuilderSection = 'Identity' | 'Description' | 'Purpose' | 'Personality' | 'Language' | 'Behavior Rules' | 'Conversation Rules' | 'Knowledge' | 'Tools' | 'Transfers' | 'Memory' | 'Guardrails' | 'Output Format' | 'Output Schema';
export type AgentBuilderConfig = { sections: Record<BuilderSection, string>; voice: string; pace: string; interruptionSensitivity: string };
const defaultConfig: AgentBuilderConfig = { sections: { Identity: 'You are Avery, a helpful sales development agent for Acme Healthcare.', Description: 'A concise overview of what this agent is responsible for.', Purpose: 'Qualify inbound leads and schedule a discovery call when there is a fit.', Personality: 'Warm, precise, and professionally curious.', Language: 'Speak English (US) by default. Match the caller when supported.', 'Behavior Rules': 'Be concise, confirm important details, and never make unsupported claims.', 'Conversation Rules': 'Ask one question at a time. Summarize needs before offering a next step.', Knowledge: 'Use the selected workspace sources. Never invent product details.', Tools: 'Use calendar availability only after a qualified caller asks to book.', Transfers: 'Transfer billing questions to the Billing queue with a short summary.', Memory: 'Remember the caller name, company, role, and stated priorities during the conversation.', Guardrails: 'Do not provide medical advice, make guarantees, or collect sensitive patient information.', 'Output Format': 'Capture qualified lead details in the specified structured fields.', 'Output Schema': 'Return qualified_lead, contact_name, company, priority, and next_step.' }, voice: 'Nova - Clear and warm', pace: 'Natural', interruptionSensitivity: 'Balanced' };
type BuilderState = { config: AgentBuilderConfig; savedConfig: AgentBuilderConfig; updateSection: (section: BuilderSection, value: string) => void; updateSetting: (setting: 'voice'|'pace'|'interruptionSensitivity', value: string) => void; save: () => void; discard: () => void; hasUnsavedChanges: () => boolean };

function createBuilderStore(agentId: string) {
  return create<BuilderState>()(persist((set, get) => ({ config: defaultConfig, savedConfig: defaultConfig, updateSection: (section, value) => set((state) => ({ config: { ...state.config, sections: { ...state.config.sections, [section]: value } } })), updateSetting: (setting, value) => set((state) => ({ config: { ...state.config, [setting]: value } })), save: () => set((state) => ({ savedConfig: structuredClone(state.config) })), discard: () => set((state) => ({ config: structuredClone(state.savedConfig) })), hasUnsavedChanges: () => JSON.stringify(get().config) !== JSON.stringify(get().savedConfig) }), { name: `relay-agent-builder-${agentId}` }));
}

const builderStores = new Map<string, UseBoundStore<StoreApi<BuilderState>>>();
function getBuilderStore(agentId: string) {
  let store = builderStores.get(agentId);
  if (!store) { store = createBuilderStore(agentId); builderStores.set(agentId, store); }
  return store;
}

export function useAgentBuilderStore<T>(agentId: string, selector: (state: BuilderState) => T): T {
  return getBuilderStore(agentId)(selector);
}
