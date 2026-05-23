import { createClient } from "@supabase/supabase-js"

// ── CONNECTION ────────────────────────────────────────────────────
// Replace these with your new Supabase project credentials
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── CONSTANTS ─────────────────────────────────────────────────────
export const SHORT_MONTHS = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
export const FULL_MONTHS  = ["January","February","March","April","May","June","July","August","September","October","November","December"]
export const CAT_COLORS   = ["#4f8ef7","#f59e0b","#10b981","#a855f7","#ef4444","#06b6d4"]

// ── SCORING ───────────────────────────────────────────────────────
export function calcPoints(value: number, bands: any[]): number | null {
  if (!bands.length) return null
  for (const b of [...bands].sort((a, b) => a.band_order - b.band_order))
    if (value >= b.threshold_min && value <= b.threshold_max) return b.points
  return 0
}

// ── CASCADE DELETES ───────────────────────────────────────────────
async function deleteSubsForLocations(locIds: string[]) {
  const { data: subs } = await supabase.from("submissions").select("id").in("location_id", locIds)
  if (subs?.length) {
    const subIds = subs.map((s: any) => s.id)
    for (const t of ["responses","threshold_flags","category_scores","overall_scores"])
      await supabase.from(t).delete().in("submission_id", subIds)
    await supabase.from("submissions").delete().in("id", subIds)
  }
}

export async function deleteSupplierCascade(id: string) {
  const { data: locs } = await supabase.from("locations").select("id").eq("supplier_id", id)
  if (locs?.length) await deleteSubsForLocations(locs.map((l: any) => l.id))
  await supabase.from("metric_relevance").delete().eq("supplier_id", id)
  await supabase.from("locations").delete().eq("supplier_id", id)
  await supabase.from("countries").delete().eq("supplier_id", id)
  await supabase.from("suppliers").delete().eq("id", id)
}

export async function deleteCountryCascade(countryId: string) {
  const { data: locs } = await supabase.from("locations").select("id").eq("country_id", countryId)
  if (locs?.length) {
    await deleteSubsForLocations(locs.map((l: any) => l.id))
    await supabase.from("locations").delete().in("id", locs.map((l: any) => l.id))
  }
  await supabase.from("countries").delete().eq("id", countryId)
}

export async function deleteLocationCascade(locationId: string) {
  await deleteSubsForLocations([locationId])
  await supabase.from("locations").delete().eq("id", locationId)
}

export async function deleteSubmissionCascade(submissionId: string) {
  for (const t of ["responses","threshold_flags","category_scores","overall_scores"])
    await supabase.from(t).delete().eq("submission_id", submissionId)
  await supabase.from("submissions").delete().eq("id", submissionId)
}
