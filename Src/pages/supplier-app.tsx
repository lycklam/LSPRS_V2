import { useState } from "react";
import Step1LocationPeriod from "@/components/submit/step1-location-period";
import Step2MetricEntry from "@/components/submit/step2-metric-entry";
import Step3Confirm from "@/components/submit/step3-confirm";
import SuccessScreen from "@/components/submit/success-screen";

const STEPS = [
  { n: 1, label: "Location & Period" },
  { n: 2, label: "Data Entry" },
  { n: 3, label: "Review & Submit" },
];

export default function SupplierApp() {
  const [step, setStep] = useState(1);
  const [selection, setSelection] = useState<any>(null);
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [flagCount, setFlagCount] = useState(0);
  const [done, setDone] = useState(false);

  const reset = () => {
    setStep(1); setSelection(null); setMetricValues({});
    setFlagCount(0); setDone(false);
  };

  if (done) return <SuccessScreen selection={selection} flagCount={flagCount} onReset={reset} />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Step indicator */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${step === s.n ? "text-green-700" : step > s.n ? "text-gray-400" : "text-gray-300"}`}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border-2 ${
                  step === s.n ? "border-green-600 bg-green-600 text-white" :
                  step > s.n ? "border-gray-300 bg-gray-100 text-gray-500" :
                  "border-gray-200 text-gray-300"
                }`}>
                  {step > s.n ? "✓" : s.n}
                </span>
                <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${step > s.n ? "bg-gray-300" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {step === 1 && (
          <Step1LocationPeriod
            selection={selection}
            onComplete={(sel) => { setSelection(sel); setStep(2); }}
          />
        )}
        {step === 2 && (
          <Step2MetricEntry
            selection={selection}
            metricValues={metricValues}
            onChange={setMetricValues}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Confirm
            selection={selection}
            metricValues={metricValues}
            onBack={() => setStep(2)}
            onSuccess={(fc) => { setFlagCount(fc); setDone(true); }}
          />
        )}
      </div>
    </div>
  );
}
