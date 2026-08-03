import { notFound } from 'next/navigation';
import { CallDetail } from '@/components/calls/call-detail';
import { mockCall } from '@/lib/mock-calls';
export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await mockCall(id);
  if (!call) notFound();
  return <CallDetail call={call} />;
}
