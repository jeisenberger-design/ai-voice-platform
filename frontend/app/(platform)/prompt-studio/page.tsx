import { AgentPromptStudio } from '@/components/agent-prompt-studio';
import { PageHeader } from '@/components/page-header';
export default function PromptStudio() {
  return (
    <>
      <PageHeader
        title="Prompt Studio"
        description="Create reliable conversation behavior with structured prompt controls."
      />
      <AgentPromptStudio />
    </>
  );
}
