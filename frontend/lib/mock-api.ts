import { activity, agents, metrics, sources, weeklyCalls } from '@/lib/mock-data';
import { mockCall, mockCallPerformance, mockCalls } from '@/lib/mock-calls';

const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
export const mockApi = {
  async getDashboard() { await pause(); return { activity, agents, metrics, weeklyCalls }; },
  async listAgents() { await pause(); return agents; },
  async listKnowledgeSources() { await pause(); return sources; },
  listCalls: mockCalls,
  getCall: mockCall,
  getCallPerformance: mockCallPerformance
};
