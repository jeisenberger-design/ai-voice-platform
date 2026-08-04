'use client';
// Edits the canonical Agent draft (lib/agent-model.ts) for exactly one, explicitly
// supplied agentId — see documentation/agent-model-implementation-plan.md Phase 3B.
// Prompt/instructions have no independent source of truth here: everything below reads
// through useAgentDraft/useAgentVersions and writes through useUpdateAgentDraft/
// usePublishAgent/useRollbackToVersion, the same repository every other Agent
// configuration surface uses (structured-editor.tsx, agent-detail-workspace.tsx).
import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  GitCompareArrows,
  History,
  RotateCcw,
  Save,
  Send,
  SplitSquareHorizontal,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { AgentValidationSummary } from '@/components/agent-validation-summary';
import { validateAgentConfig } from '@/lib/agent-validation';
import {
  useAgentDraft,
  useAgentVersions,
  usePublishAgent,
  useRollbackToVersion,
  useUpdateAgentDraft,
} from '@/hooks/use-agent-data';
import type { InstructionSection } from '@/lib/agent-model';
import { cn } from '@/lib/utils';

const promptStudioSections = [
  'Identity',
  'Greeting',
  'Conversation Rules',
  'Knowledge Instructions',
  'Emergency Rules',
  'Transfer Rules',
  'Data Collection',
  'Output Schema',
] as const;
type PromptStudioSection = (typeof promptStudioSections)[number];

// Maps this studio's 8-section authoring vocabulary onto the canonical 14
// InstructionSections — the mapping documentation/agent-model-implementation-plan.md
// §11 risk 2 already proposed, not invented here. "Greeting" folds into "Identity"
// (opening behavior is part of identity); two Studio sections sharing one canonical
// field is a known, documented simplification, not an oversight.
const SECTION_MAP: Record<PromptStudioSection, InstructionSection> = {
  Identity: 'Identity',
  Greeting: 'Identity',
  'Conversation Rules': 'Conversation Rules',
  'Knowledge Instructions': 'Knowledge',
  'Emergency Rules': 'Guardrails',
  'Transfer Rules': 'Transfers',
  'Data Collection': 'Output Format',
  'Output Schema': 'Output Schema',
};

export function AgentPromptStudio({ agentId }: { agentId: string }) {
  const { data: draft } = useAgentDraft(agentId);
  const { data: versions = [] } = useAgentVersions(agentId);
  const updateDraft = useUpdateAgentDraft(agentId);
  const publishAgent = usePublishAgent(agentId);
  const rollback = useRollbackToVersion(agentId);

  const [active, setActive] = useState<PromptStudioSection>(promptStudioSections[0]);
  const [compare, setCompare] = useState(false);
  // "draft" is the editable current draft; any other value is a published version's id,
  // selected read-only from history below.
  const [selectedVersionId, setSelectedVersionId] = useState<string>('draft');

  // Explicit-save staging — identical semantics to agent-detail-workspace.tsx's
  // `staged` (Phase 3A): edits accumulate here, untouched in the repository, until
  // "Save changes" is clicked.
  const [staged, setStaged] = useState<Partial<Record<InstructionSection, string>>>({});
  const hasUnsavedChanges = Object.keys(staged).length > 0;
  const mergedInstructions = useMemo(
    () => (draft ? { ...draft.instructions, ...staged } : undefined),
    [draft, staged],
  );

  if (!draft || !mergedInstructions) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        Loading agent draft…
      </div>
    );
  }

  const canonicalSection = SECTION_MAP[active];
  const latestPublished = versions[0]; // listVersions() returns newest first
  const selectedVersion =
    selectedVersionId === 'draft' ? null : versions.find((v) => v.versionId === selectedVersionId);
  const viewingDraft = selectedVersion === null;

  const setSectionValue = (value: string) =>
    setStaged((current) => ({ ...current, [canonicalSection]: value }));
  const save = async () => {
    if (!hasUnsavedChanges) return;
    await updateDraft.mutateAsync({ instructions: staged });
    setStaged({});
  };
  const discard = () => setStaged({});

  const hasErrors = validateAgentConfig(mergedInstructions).some(
    (result) => result.severity === 'error',
  );

  const publish = async () => {
    if (hasUnsavedChanges || hasErrors) return;
    await publishAgent.mutateAsync();
  };

  const rollbackToSelected = async () => {
    if (!selectedVersion) return;
    if (
      hasUnsavedChanges &&
      !window.confirm('Rolling back will discard your unsaved staged edits. Continue?')
    ) {
      return;
    }
    setStaged({});
    await rollback.mutateAsync(selectedVersion.versionId);
    setSelectedVersionId('draft');
  };

  const displayedText = selectedVersion
    ? selectedVersion.instructions[canonicalSection]
    : mergedInstructions[canonicalSection];

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_1fr_260px]">
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-sm font-medium">Prompt sections</span>
          <Button variant="ghost" className="h-7 px-1" aria-label="Duplicate prompt" disabled>
            <Copy size={15} />
          </Button>
        </div>
        {promptStudioSections.map((section, index) => (
          <button
            onClick={() => setActive(section)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted',
              active === section && 'bg-muted text-foreground font-medium',
            )}
            key={section}
          >
            <span className="text-xs">{String(index + 1).padStart(2, '0')}</span>
            {section}
          </button>
        ))}
      </aside>
      <div className="space-y-4">
        {viewingDraft && <AgentValidationSummary instructions={mergedInstructions} />}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{active}</h2>
                <Badge
                  variant={selectedVersion ? 'success' : hasUnsavedChanges ? 'warning' : 'neutral'}
                >
                  {selectedVersion
                    ? `Published v${selectedVersion.versionNumber}`
                    : hasUnsavedChanges
                      ? 'Unsaved draft'
                      : 'Draft'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Structured behavior block. Maps to the canonical{' '}
                <span className="font-medium">{canonicalSection}</span> instruction section.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {viewingDraft && hasUnsavedChanges && (
                <Button variant="outline" onClick={discard}>
                  Discard
                </Button>
              )}
              {viewingDraft && (
                <Button
                  variant="outline"
                  onClick={save}
                  disabled={!hasUnsavedChanges || updateDraft.isPending}
                >
                  <Save size={16} className="mr-2" />
                  Save changes
                </Button>
              )}
              <Button variant="outline" onClick={() => setCompare((value) => !value)}>
                <GitCompareArrows size={16} className="mr-2" />
                {compare ? 'Close compare' : 'Compare'}
              </Button>
              {viewingDraft && (
                <Button
                  onClick={publish}
                  disabled={hasUnsavedChanges || hasErrors || publishAgent.isPending}
                >
                  <Send size={16} className="mr-2" />
                  {publishAgent.isPending ? 'Publishing…' : 'Publish'}
                </Button>
              )}
            </div>
          </div>
          {compare ? (
            latestPublished ? (
              <div className="grid divide-x md:grid-cols-2">
                <PromptBlock
                  title={`v${latestPublished.versionNumber} · Published`}
                  value={latestPublished.instructions[canonicalSection]}
                  editable={false}
                />
                <PromptBlock
                  title="Draft"
                  value={mergedInstructions[canonicalSection]}
                  editable
                  onChange={setSectionValue}
                />
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">
                No published version yet — nothing to compare the draft against.
              </div>
            )
          ) : (
            <PromptBlock
              title={
                selectedVersion
                  ? `v${selectedVersion.versionNumber} · Published`
                  : hasUnsavedChanges
                    ? 'Draft · Unsaved'
                    : 'Draft'
              }
              value={displayedText}
              editable={viewingDraft}
              onChange={viewingDraft ? setSectionValue : undefined}
            />
          )}
          {viewingDraft && hasUnsavedChanges && (
            <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Save your changes before publishing.
            </p>
          )}
          {publishAgent.isError && (
            <p className="border-t bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400">
              {(publishAgent.error as Error).message}
            </p>
          )}
        </Card>
        {publishAgent.isSuccess && viewingDraft && !hasUnsavedChanges && latestPublished && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={16} />
            Version {latestPublished.versionNumber} published to the agent configuration.
          </div>
        )}
      </div>
      <aside className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <History size={16} />
            <h2 className="font-medium">Version history</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Restore or compare previous behavior.
          </p>
        </div>
        <div className="divide-y">
          <button
            onClick={() => setSelectedVersionId('draft')}
            className={cn(
              'w-full p-4 text-left hover:bg-muted/50',
              selectedVersionId === 'draft' && 'bg-muted/50',
            )}
          >
            <div className="flex justify-between">
              <span className="text-sm font-medium">Draft</span>
              <Badge variant={hasUnsavedChanges ? 'warning' : 'neutral'}>
                {hasUnsavedChanges ? 'Unsaved' : 'Current'}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The editable configuration. Publish to snapshot it.
            </p>
          </button>
          {versions.map((version) => (
            <button
              onClick={() => setSelectedVersionId(version.versionId)}
              className={cn(
                'w-full p-4 text-left hover:bg-muted/50',
                selectedVersionId === version.versionId && 'bg-muted/50',
              )}
              key={version.versionId}
            >
              <div className="flex justify-between">
                <span className="text-sm font-medium">v{version.versionNumber}</span>
                <Badge variant="success">Published</Badge>
              </div>
              {version.legacyLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Legacy label: {version.legacyLabel}
                </p>
              )}
            </button>
          ))}
          {versions.length === 0 && (
            <p className="p-4 text-xs text-muted-foreground">
              No published versions yet — publish the draft to create the first one.
            </p>
          )}
        </div>
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={rollbackToSelected}
            disabled={!selectedVersion || rollback.isPending}
          >
            <RotateCcw size={15} className="mr-2" />
            {selectedVersion
              ? `Roll back draft to v${selectedVersion.versionNumber}`
              : 'Select a published version to roll back'}
          </Button>
        </div>
      </aside>
    </div>
  );
}
function PromptBlock({
  title,
  value,
  editable,
  onChange,
}: {
  title: string;
  value: string;
  editable: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className={cn('p-5', !editable && 'bg-muted/20')}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <SplitSquareHorizontal size={16} className="text-muted-foreground" />
      </div>
      <label className="block text-sm font-medium">
        Behavior contract
        <textarea
          className="input mt-2 min-h-48 resize-y"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={!editable}
        />
      </label>
      <div className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
        This section is composed with the other structured blocks at publish time.
      </div>
    </div>
  );
}
