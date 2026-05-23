import { Button } from "@/components/ui/button";
import { SHORT_MONTHS } from "@/lib/supabase";

interface Props {
  selection: any;
  flagCount: number;
  onReset: () => void;
}

export default function SuccessScreen({ selection, flagCount, onReset }: Props) {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-6 px-4">
      <div className="text-6xl">✅</div>
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Submission Recorded</h2>
        <p className="text-gray-500 mt-2">Performance data for <strong>{SHORT_MONTHS[selection?.month]} {selection?.year}</strong> has been submitted successfully.</p>
      </div>
      {flagCount > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
          <div className="font-semibold text-amber-800 mb-1">⚠️ {flagCount} metric{flagCount > 1 ? "s were" : " was"} flagged</div>
          <p className="text-sm text-amber-700">One or more metrics were below the expected threshold. The internal team has been notified and will review these before approving the submission.</p>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="font-semibold text-green-800 mb-1">✓ No issues detected</div>
          <p className="text-sm text-green-700">All metrics are within expected ranges. The internal team will review and approve your submission shortly.</p>
        </div>
      )}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-sm space-y-2">
        <div className="font-semibold text-gray-700 mb-2">What happens next?</div>
        <div className="flex items-start gap-2 text-gray-600"><span className="text-blue-500 mt-0.5">1.</span><span>Your submission is now visible to the internal rating team.</span></div>
        <div className="flex items-start gap-2 text-gray-600"><span className="text-blue-500 mt-0.5">2.</span><span>The team will add internal quality ratings and review your data.</span></div>
        <div className="flex items-start gap-2 text-gray-600"><span className="text-blue-500 mt-0.5">3.</span><span>Once approved, your scores will be included in the monthly scorecard.</span></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        <Button onClick={onReset} className="bg-green-600 hover:bg-green-700 text-white">Submit Another Month</Button>
        <Button variant="outline" onClick={onReset}>Back to Home</Button>
      </div>
    </div>
  );
}
