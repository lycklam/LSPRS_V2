import { useState } from "react";
import SuppliersTab from "@/components/setup/suppliers-tab";
import CountriesTab from "@/components/setup/countries-tab";
import LocationsTab from "@/components/setup/locations-tab";
import MetricRelevanceTab from "@/components/setup/metric-relevance-tab";
import EnterRatings from "@/components/rating/enter-ratings";
import ReviewPanel from "@/components/review/review-panel";

const SETUP_TABS = [
  { key: "suppliers", label: "Suppliers" },
  { key: "countries", label: "Countries" },
  { key: "locations", label: "Locations" },
  { key: "relevance", label: "Metric Relevance" },
];

export default function RaterApp() {
  const [nav, setNav] = useState("review");
  const [setupTab, setSetupTab] = useState("suppliers");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-52 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rater App</div>
          <div className="text-xs text-gray-400 mt-0.5">Internal team</div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {[
            { key: "review", label: "Review & Approve", icon: "🔍" },
            { key: "ratings", label: "Enter Ratings", icon: "⭐" },
            { key: "setup", label: "Setup", icon: "⚙️" },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setNav(item.key)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${nav === item.key ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {nav === "review" && <ReviewPanel />}
          {nav === "ratings" && <EnterRatings />}
          {nav === "setup" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Setup</h2>
                <p className="text-sm text-gray-500 mt-1">Manage suppliers, countries, locations and metric relevance.</p>
              </div>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {SETUP_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setSetupTab(tab.key)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${setupTab === tab.key ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {setupTab === "suppliers" && <SuppliersTab />}
              {setupTab === "countries" && <CountriesTab />}
              {setupTab === "locations" && <LocationsTab />}
              {setupTab === "relevance" && <MetricRelevanceTab />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
