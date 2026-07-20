import { notFound } from 'next/navigation';
import { ToolDetail } from '@/components/tools/tool-detail';
import { mockTool } from '@/lib/mock-tools';
export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tool = await mockTool(id);
  if (!tool) notFound();
  return <ToolDetail tool={tool} />;
}
