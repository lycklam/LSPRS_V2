// @ts-nocheck
import { useState } from "react";
import SuppliersTab from "@/components/setup/suppliers-tab";
import CountriesTab from "@/components/setup/countries-tab";
import LocationsTab from "@/components/setup/locations-tab";
import MetricRelevanceTab from "@/components/setup/metric-relevance-tab";
import EnterRatings from "@/components/rating/enter-ratings";
import ReviewPanel from "@/components/review/review-panel";
import ReportingDashboard from "@/components/reporting/reporting-dashboard";

const SETUP_TABS = [
  { key: "suppliers", label: "Suppliers" },
  { key: "countries", label: "Countries" },
  { key: "locations", label: "Locations" },
  { key: "relevance", label: "Metric Relevance" },
];

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: ChartIcon },
  { key: "review",    label: "Review & Approve", icon: ReviewIcon },
  { key: "ratings",   label: "Enter Ratings", icon: StarIcon },
  { key: "setup",     label: "Setup", icon: SettingsIcon },
];

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12l3.5-4 3 2.5L12 5" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 14h12" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function ReviewIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M2 8h8M2 12h6" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function StarIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke={active ? "#2563EB" : "#94A3B8"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

const PAGE_HEADERS: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Reporting Dashboard", subtitle: "Trend analysis, location aggregates and metric drill-down." },
  review:    { title: "Review & Approve", subtitle: "Review monthly submissions and approve or flag them for follow-up." },
  ratings:   { title: "Enter Internal Ratings", subtitle: "Rate qualitative Likert metrics for each supplier location." },
  setup:     { title: "Setup", subtitle: "Manage suppliers, countries, locations and metric relevance settings." },
};

export default function RaterApp() {
  const [nav, setNav] = useState("dashboard");
  const [setupTab, setSetupTab] = useState("suppliers");

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 73px)" }}>
      <style>{`
        .sidebar{width:220px;flex-shrink:0;background:#fff;border-right:1px solid #E2E8F0;display:flex;flex-direction:column;padding:16px 0}
        .nav-section-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94A3B8;padding:8px 16px 4px}
        .nav-item{display:flex;align-items:center;gap:10px;padding:9px 16px;margin:1px 8px;border-radius:8px;font-size:13.5px;font-weight:500;color:#475569;cursor:pointer;border:none;background:none;width:calc(100% - 16px);text-align:left;transition:all 0.15s;font-family:'DM Sans',sans-serif}
        .nav-item:hover{background:#F8FAFC;color:#0F1B2D}
        .nav-item.active{background:#EFF6FF;color:#2563EB;font-weight:600}
        .main-content{flex:1;overflow:auto;padding:28px 32px;max-width:1200px}
        .page-header{margin-bottom:24px}
        .page-title{font-size:20px;font-weight:700;color:#0F1B2D;letter-spacing:-0.02em}
        .page-subtitle{font-size:13px;color:#64748B;margin-top:4px}
        .tab-bar{display:flex;gap:2px;background:#F1F5F9;border-radius:10px;padding:3px;width:fit-content;margin-bottom:20px}
        .tab-item{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;background:none;color:#64748B;transition:all 0.15s;font-family:'DM Sans',sans-serif}
        .tab-item:hover{color:#334155}
        .tab-item.active{background:#fff;color:#2563EB;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
      `}</style>

      <aside className="sidebar">
        <div className="nav-section-label">Navigation</div>
        {NAV_ITEMS.map(item => (
          <button key={item.key} className={`nav-item ${nav === item.key ? "active" : ""}`} onClick={() => setNav(item.key)}>
            <item.icon active={nav === item.key} />
            {item.label}
          </button>
        ))}
      </aside>

      <main className="main-content">
        <div className="page-header">
          <div className="page-title">{PAGE_HEADERS[nav]?.title}</div>
          <div className="page-subtitle">{PAGE_HEADERS[nav]?.subtitle}</div>
        </div>

        {nav === "dashboard" && <ReportingDashboard />}
        {nav === "review"    && <ReviewPanel />}
        {nav === "ratings"   && <EnterRatings />}
        {nav === "setup" && (
          <div>
            <div className="tab-bar">
              {SETUP_TABS.map(tab => (
                <button key={tab.key} className={`tab-item ${setupTab === tab.key ? "active" : ""}`} onClick={() => setSetupTab(tab.key)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {setupTab === "suppliers"  && <SuppliersTab />}
            {setupTab === "countries"  && <CountriesTab />}
            {setupTab === "locations"  && <LocationsTab />}
            {setupTab === "relevance"  && <MetricRelevanceTab />}
          </div>
        )}
      </main>
    </div>
  );
}
