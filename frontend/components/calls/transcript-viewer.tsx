'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import type { TranscriptEntry } from '@/lib/mock-calls';
export function TranscriptViewer({ transcript }: { transcript: TranscriptEntry[] }) {
  const [query, setQuery] = useState('');
  const entries = useMemo(
    () =>
      transcript.filter(
        (entry) =>
          !query ||
          entry.text.toLowerCase().includes(query.toLowerCase()) ||
          entry.speaker.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, transcript],
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">Transcript</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Speaker-separated conversation record.
          </p>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input w-full pl-8 sm:w-60"
            placeholder="Search transcript"
          />
        </div>
      </div>
      <div className="max-h-[560px] space-y-4 overflow-y-auto p-5">
        {entries.map((entry, index) =>
          entry.event ? (
            <div className="flex items-center gap-3" key={index}>
              <span className="font-mono text-xs text-muted-foreground">{entry.time}</span>
              <div className="h-px flex-1 bg-border" />
              <Badge>{entry.text}</Badge>
            </div>
          ) : (
            <div className="grid grid-cols-[48px_1fr] gap-3" key={index}>
              <span className="pt-1 font-mono text-xs text-muted-foreground">{entry.time}</span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {entry.speaker === 'Agent' ? 'Emma' : 'Caller'}
                </p>
                <p className="mt-1 rounded-md bg-muted/60 p-3 text-sm leading-6">
                  {highlight(entry.text, query)}
                </p>
              </div>
            </div>
          ),
        )}
      </div>
    </Card>
  );
}
function highlight(value: string, query: string) {
  if (!query) return value;
  const parts = value.split(new RegExp(`(${query})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark className="bg-amber-300/40 text-inherit" key={index}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
