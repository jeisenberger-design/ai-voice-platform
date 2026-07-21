import { notFound } from 'next/navigation';
import { WorkflowDetail } from '@/components/workflows/workflow-detail';
import { mockWorkflow } from '@/lib/mock-workflows';
export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await mockWorkflow(id);
  if (!workflow) notFound();
  return <WorkflowDetail workflow={workflow} />;
}
