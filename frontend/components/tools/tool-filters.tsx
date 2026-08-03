'use client';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToolsStore } from '@/stores/tools-store';
export function ToolFilters() {
  const { filters, setFilter, reset } = useToolsStore();
  return (
    <div className="space-y-3 border-b p-4">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
        <input
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          className="input pl-9"
          placeholder="Search tools by name or description"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={15} className="text-muted-foreground" />
        <select
          value={filters.category}
          onChange={(e) => setFilter('category', e.target.value as never)}
          className="input w-auto"
        >
          <option value="">All categories</option>
          <option>Scheduling</option>
          <option>CRM</option>
          <option>Data</option>
          <option>Communication</option>
          <option>Custom</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as never)}
          className="input w-auto"
        >
          <option value="">Any status</option>
          <option>Active</option>
          <option>Draft</option>
        </select>
        <Button variant="ghost" onClick={reset} className="text-muted-foreground">
          <X size={15} className="mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
