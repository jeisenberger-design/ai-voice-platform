'use client';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCallsStore } from '@/stores/calls-store';
export function CallFilters() {
  const { filters, setFilter, reset } = useCallsStore();
  return (
    <div className="space-y-3 border-b p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            value={filters.query}
            onChange={(e) => setFilter('query', e.target.value)}
            className="input pl-9"
            placeholder="Search caller, phone, call ID, or transcript"
          />
        </div>
        <select
          value={filters.dateRange}
          onChange={(e) => setFilter('dateRange', e.target.value)}
          className="input w-full lg:w-40"
        >
          <option>Last 30 days</option>
          <option>Last 7 days</option>
          <option>Today</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={15} className="text-muted-foreground" />
        <select
          value={filters.agent}
          onChange={(e) => setFilter('agent', e.target.value)}
          className="input w-auto"
        >
          <option value="">All agents</option>
          <option>Emma Healthcare Assistant</option>
          <option>Morgan Support</option>
          <option>Jordan Scheduling</option>
          <option>Avery Sales</option>
        </select>
        <select
          value={filters.outcome}
          onChange={(e) => setFilter('outcome', e.target.value as never)}
          className="input w-auto"
        >
          <option value="">All outcomes</option>
          <option>Appointment Request</option>
          <option>Qualified Lead</option>
          <option>Resolved</option>
          <option>Transferred</option>
          <option>No Match</option>
        </select>
        <select
          value={filters.language}
          onChange={(e) => setFilter('language', e.target.value)}
          className="input w-auto"
        >
          <option value="">All languages</option>
          <option>English (US)</option>
          <option>Spanish</option>
        </select>
        <select
          value={filters.transfer}
          onChange={(e) => setFilter('transfer', e.target.value as never)}
          className="input w-auto"
        >
          <option value="">Any transfer</option>
          <option>No</option>
          <option>Yes - Billing</option>
          <option>Yes - Care team</option>
        </select>
        <Button variant="ghost" onClick={reset} className="text-muted-foreground">
          <X size={15} className="mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
