import { useState } from "react";
import Step1LocationPeriod from "@/components/submit/step1-location-period";
import Step2MetricEntry from "@/components/submit/step2-metric-entry";
import Step3Confirm from "@/components/submit/step3-confirm";
import SuccessScreen from "@/components/submit/success-screen";

const STEPS = [
  { n: 1, label: "Location & Period", desc: "Identify your site" },
  { n: 2, label: "Performance Data", desc: "Enter KPI figures" },
  { n: 3, label: "Review & Submit", desc: "Confirm and send" },
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
    <div style={{ minHeight: 'calc(100vh - 73px)', background: '#F0F2F5' }}>
      <style>{`
        .stepper-bar {
          background: #fff;
          border-bottom: 1px solid #E2E8F0;
          padding: 0 32px;
        }
        .stepper-inner {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          padding: 16px 0;
          gap: 0;
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .step-circle {
          width: 32px; height: 32px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .step-circle.done { background: #DCFCE7; color: #16A34A; }
        .step-circle.active { background: #2563EB; color: #fff; box-shadow: 0 0 0 4px #DBEAFE; }
        .step-circle.pending { background: #F1F5F9; color: #94A3B8; }
        .step-labels {}
        .step-label { font-size: 13px; font-weight: 600; color: #0F1B2D; }
        .step-label.pending { color: #94A3B8; }
        .step-desc { font-size: 11px; color: #94A3B8; margin-top: 1px; }
        .step-connector {
          flex: 1;
          max-width: 48px;
          height: 1px;
          background: #E2E8F0;
          margin: 0 8px;
        }
        .step-connector.done { background: #86EFAC; }
        .supplier-content {
          max-width: 860px;
          margin: 0 auto;
          padding: 28px 32px;
        }
      `}</style>

      {/* Stepper */}
      <div className="stepper-bar">
        <div className="stepper-inner">
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div className="step-item">
                <div className={`step-circle ${step > s.n ? 'done' : step === s.n ? 'active' : 'pending'}`}>
                  {step > s.n ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3.5 3.5 5.5-6" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : s.n}
                </div>
                <div className="step-labels">
                  <div className={`step-label ${step < s.n ? 'pending' : ''}`}>{s.label}</div>
                  <div className="step-desc">{s.desc}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-connector ${step > s.n ? 'done' : ''}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="supplier-content">
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
