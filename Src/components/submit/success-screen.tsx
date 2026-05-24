import { SHORT_MONTHS } from "@/lib/supabase";

interface Props {
  selection: any;
  flagCount: number;
  onReset: () => void;
}

export default function SuccessScreen({ selection, flagCount, onReset }: Props) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px" }}>
      <style>{`
        .ss-card { background:#fff; border:1px solid #E2E8F0; border-radius:16px; padding:40px; box-shadow:0 4px 20px rgba(15,27,45,0.08); text-align:center; }
        .ss-icon { width:64px; height:64px; border-radius:50%; background:#DCFCE7; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; }
        .ss-title { font-size:22px; font-weight:700; color:#0F1B2D; margin:0 0 8px; letter-spacing:-0.02em; }
        .ss-subtitle { font-size:14px; color:#64748B; margin:0; line-height:1.6; }
        .ss-alert { border-radius:10px; padding:14px 18px; text-align:left; margin-top:20px; }
        .ss-alert-title { font-size:13.5px; font-weight:700; margin:0 0 4px; }
        .ss-alert-body { font-size:13px; line-height:1.6; margin:0; }
        .ss-steps { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:18px; text-align:left; margin-top:16px; }
        .ss-steps-title { font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 12px; }
        .ss-step { display:flex; gap:12px; align-items:flex-start; margin-bottom:10px; }
        .ss-step:last-child { margin-bottom:0; }
        .ss-step-num { width:22px; height:22px; border-radius:50%; background:#DBEAFE; color:#2563EB; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
        .ss-step-text { font-size:13px; color:#475569; line-height:1.5; }
        .ss-btn-row { display:flex; gap:10px; justify-content:center; margin-top:24px; flex-wrap:wrap; }
        .ss-btn-primary { height:42px; padding:0 24px; background:#059669; color:#fff; border:none; border-radius:9px; font-size:13.5px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ss-btn-primary:hover { background:#047857; }
        .ss-btn-outline { height:42px; padding:0 24px; background:#fff; color:#475569; border:1.5px solid #CBD5E1; border-radius:9px; font-size:13.5px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .ss-btn-outline:hover { border-color:#94A3B8; color:#0F1B2D; }
      `}</style>

      <div className="ss-card">
        <div className="ss-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M5 14l6 6 12-12" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="ss-title">Submission Recorded</h2>
        <p className="ss-subtitle">
          Performance data for <strong>{SHORT_MONTHS[selection?.month]} {selection?.year}</strong> has been submitted successfully.
        </p>

        {flagCount > 0 ? (
          <div className="ss-alert" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
            <div className="ss-alert-title" style={{ color: "#B45309" }}>⚠ {flagCount} metric{flagCount > 1 ? "s were" : " was"} flagged</div>
            <p className="ss-alert-body" style={{ color: "#92400E" }}>One or more metrics were below the expected threshold. The internal team will review these before approving.</p>
          </div>
        ) : (
          <div className="ss-alert" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <div className="ss-alert-title" style={{ color: "#15803D" }}>✓ No issues detected</div>
            <p className="ss-alert-body" style={{ color: "#166534" }}>All metrics are within expected ranges. The internal team will review and approve your submission shortly.</p>
          </div>
        )}

        <div className="ss-steps">
          <div className="ss-steps-title">What happens next</div>
          <div className="ss-step"><div className="ss-step-num">1</div><div className="ss-step-text">Your submission is now visible to the internal rating team.</div></div>
          <div className="ss-step"><div className="ss-step-num">2</div><div className="ss-step-text">The team will add internal quality ratings and review your data.</div></div>
          <div className="ss-step"><div className="ss-step-num">3</div><div className="ss-step-text">Once approved, your scores will be included in the monthly scorecard.</div></div>
        </div>

        <div className="ss-btn-row">
          <button className="ss-btn-primary" onClick={onReset}>Submit Another Month</button>
          <button className="ss-btn-outline" onClick={onReset}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}
