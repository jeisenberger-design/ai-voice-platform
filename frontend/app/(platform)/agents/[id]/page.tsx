import { AgentDetailWorkspace } from '@/components/agent-detail-workspace';
export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentDetailWorkspace agentId={id} />;
}
