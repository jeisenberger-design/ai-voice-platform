import { Download } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { weeklyCalls } from '@/lib/mock-data';
export default function Analytics() {
  const max = Math.max(...weeklyCalls);
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Understand the performance of every conversation."
        actions={
          <>
            <Button variant="outline">Last 30 days</Button>
            <Button variant="outline">
              <Download size={16} className="mr-2" />
              Export
            </Button>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Answered calls', '2,663', '+18.4%'],
          ['Qualified leads', '742', '+12.1%'],
          ['Resolution rate', '91.4%', '+1.8%'],
        ].map(([l, v, d]) => (
          <Card className="p-5" key={l}>
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="mt-2 text-3xl font-semibold">{v}</p>
            <Badge variant="success">{d} vs. previous period</Badge>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="font-medium">Call outcomes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Daily completed conversations</p>
          <div className="mt-8 flex h-56 items-end gap-3">
            {weeklyCalls.map((value, i) => (
              <div className="group flex flex-1 flex-col items-center gap-2" key={value + i}>
                <span className="invisible text-xs group-hover:visible">{value}</span>
                <div
                  className="w-full rounded-t bg-foreground/85"
                  style={{ height: `${(value / max) * 170}px` }}
                />
                <span className="text-xs text-muted-foreground">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-medium">Disposition</h2>
          <p className="mt-1 text-sm text-muted-foreground">Conversation result distribution</p>
          <div className="mt-8 space-y-5">
            {[
              ['Resolved', 61],
              ['Qualified', 28],
              ['Transferred', 7],
              ['Abandoned', 4],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="text-muted-foreground">{value}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-foreground" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
