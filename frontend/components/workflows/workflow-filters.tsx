'use client';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useWorkflowsStore } from '@/stores/workflows-store';
export function WorkflowFilters() {
  const { filters, setFilter, reset } = useWorkflowsStore();
  return (
    <div className="space-y-3 border-b p-4">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
        <input
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          className="input pl-9"
          placeholder="Search workflows by name or description"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={15} className="text-muted-foreground" />
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as never)}
          className="input w-auto"
        >
          <option value="">Any status</option>
          <option>Live</option>
          <option>Draft</option>
          <option>Paused</option>
        </select>
        <Button variant="ghost" onClick={reset} className="text-muted-foreground">
          <X size={15} className="mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
