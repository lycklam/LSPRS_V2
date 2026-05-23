import { useState } from "react"
import { Toaster } from "@/components/ui/toaster"
import RaterApp from "@/pages/rater-app"
import SupplierApp from "@/pages/supplier-app"

type AppMode = "rater" | "supplier"

export default function App() {
  const [mode, setMode] = useState<AppMode>("rater")
  return (
    <>
      <div className="sticky top-0 z-50 bg-red-900 text-white text-xs font-semibold text-center py-2 px-4">
        ⚠️ DEMO ENVIRONMENT — FOR TESTING PURPOSES ONLY — Do not enter real company or supplier data
      </div>
      <div className="flex bg-white border-b border-gray-200">
        <button
          onClick={() => setMode("rater")}
          className={`px-8 py-3 text-sm font-semibold border-b-2 transition-all ${mode === "rater" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          🔵 Rater App — Internal
        </button>
        <button
          onClick={() => setMode("supplier")}
          className={`px-8 py-3 text-sm font-semibold border-b-2 transition-all ${mode === "supplier" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          🟢 Supplier App — LSP
        </button>
      </div>
      {mode === "rater" ? <RaterApp /> : <SupplierApp />}
      <Toaster />
    </>
  )
}
