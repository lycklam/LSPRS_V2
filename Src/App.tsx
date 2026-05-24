import { useState } from "react"
import { Toaster } from "@/components/ui/toaster"
import RaterApp from "@/pages/rater-app"
import SupplierApp from "@/pages/supplier-app"

type AppMode = "rater" | "supplier"

export default function App() {
  const [mode, setMode] = useState<AppMode>("rater")
  return (
    <div className="min-h-screen" style={{ background: "#F0F2F5", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'DM Sans', sans-serif; }
        .mono { font-family: 'DM Mono', monospace; }
        :root {
          --navy: #0F1B2D;
          --navy-mid: #1A2E4A;
          --blue: #2563EB;
          --blue-light: #EFF6FF;
          --green: #059669;
          --green-light: #ECFDF5;
          --amber: #D97706;
          --red: #DC2626;
          --border: #E2E8F0;
          --text: #0F1B2D;
          --muted: #64748B;
          --surface: #FFFFFF;
        }
        .app-header {
          background: var(--navy);
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .mode-btn {
          position: relative;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: rgba(255,255,255,0.5);
          border: none;
          background: none;
          cursor: pointer;
          transition: color 0.2s;
        }
        .mode-btn:hover { color: rgba(255,255,255,0.8); }
        .mode-btn.active { color: #fff; }
        .mode-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 16px; right: 16px;
          height: 2px;
          background: var(--blue);
          border-radius: 2px 2px 0 0;
        }
        .mode-btn.supplier.active::after { background: #10B981; }
        .demo-banner {
          background: #7F1D1D;
          color: #FCA5A5;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-align: center;
          padding: 6px 16px;
        }
        .logo-mark {
          width: 28px; height: 28px;
          background: var(--blue);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: white;
        }
      `}</style>

      {/* Header */}
      <header className="app-header">
        <div className="demo-banner">
          ⚠ Demo Environment — Do not enter real company or supplier data
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
            <div className="logo-mark">LS</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>LSP Scorecard</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Rating Platform</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`mode-btn ${mode === 'rater' ? 'active' : ''}`} onClick={() => setMode('rater')}>
              Internal — Rater App
            </button>
            <button className={`mode-btn supplier ${mode === 'supplier' ? 'active' : ''}`} onClick={() => setMode('supplier')}>
              LSP — Supplier App
            </button>
          </div>
        </div>
      </header>

      {mode === "rater" ? <RaterApp /> : <SupplierApp />}
      <Toaster />
    </div>
  )
}
