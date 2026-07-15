import { activity, agents, metrics, sources, weeklyCalls } from '@/lib/mock-data';

const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
export const mockApi = {
  async getDashboard() { await pause(); return { activity, agents, metrics, weeklyCalls }; },
  async listAgents() { await pause(); return agents; },
  async listKnowledgeSources() { await pause(); return sources; }
};
