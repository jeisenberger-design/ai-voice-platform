import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui';
export function CallTimeline({
  events,
}: {
  events: Array<{ time: string; title: string; detail: string }>;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-medium">Call timeline</h2>
      <p className="mt-1 text-sm text-muted-foreground">Key agent and system events.</p>
      <div className="mt-5 space-y-0">
        {events.map((event, index) => (
          <div
            className="grid grid-cols-[48px_18px_1fr] gap-3 pb-5"
            key={`${event.time}-${event.title}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
            <div className="relative">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
              {index < events.length - 1 && (
                <span className="absolute left-[7px] top-4 h-[30px] w-px bg-border" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">{event.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
