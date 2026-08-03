import { CheckCircle2, Gauge, Star } from 'lucide-react';
import { Card } from '@/components/ui';
import type { CallRecord } from '@/lib/mock-calls';
export function QualityScoreCard({ call }: { call: CallRecord }) {
  const evaluation = [
    ['Greeting', call.quality.greeting],
    ['Information Capture', call.quality.informationCapture],
    ['Tone', call.quality.tone],
    ['Resolution', call.quality.resolution],
  ];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Gauge size={18} />
        <h2 className="font-medium">Call quality</h2>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <div className="grid size-20 place-items-center rounded-full border-4 border-emerald-500/80">
          <span className="text-xl font-semibold">{call.qualityScore}</span>
        </div>
        <div>
          <p className="font-medium">{call.qualityScore} / 100</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mock evaluator score. Ready for future AI evaluator integration.
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {evaluation.map(([label, value]) => (
          <div className="flex items-center justify-between text-sm" key={label}>
            <span>{label}</span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
              {value === 'Excellent' ? (
                <>
                  <Star size={14} className="text-amber-500" />
                  Excellent
                </>
              ) : (
                value
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
