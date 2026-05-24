// ═══════════════════════════════════════════════════════════════════════
// LSP SCORECARD — SCORING ENGINE
// src/lib/scoring-engine.ts
//
// Call runScoringEngine(submissionId) after any submission save.
// Idempotent — deletes and rewrites scores on every run.
//
// Formula (Sheet 4):
//   normalized = (points_earned / max_relevant_points) * category_weight
//   overall    = sum of all normalized scores  (0–100 scale)
//
// Rules:
//   - Only answered metrics count in numerator AND denominator
//   - Unanswered relevant metrics excluded from both
//   - Relevance: location-level overrides supplier defaults
//   - Likert points: from likert_anchors.points for the matched score
//   - Numeric points: scoring_bands lookup (supplier-specific first)
//   - Zero-tolerance (metrics 20 & 22): value >= 1 → 0 pts, still counted
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase";

export interface CategoryScore {
  category_id: string;
  category_name: string;
  category_number: number;
  category_weight: number;
  points_earned: number;
  max_points_relevant: number;
  normalized_score: number;
  pct_score: number;
  metrics_answered: number;
  metrics_relevant: number;
}

export interface ScoringResult {
  submission_id: string;
  category_scores: CategoryScore[];
  total_score: number;
  score_pct: number;
  metrics_answered: number;
  metrics_relevant: number;
  completeness_pct: number;
}

export async function runScoringEngine(submissionId: string): Promise<ScoringResult> {

  // 1. Submission context
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, supplier_id, location_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) throw new Error(`Submission not found: ${submissionId}`);

  // 2. Reference data — load in parallel
  const [
    { data: categories },
    { data: metrics },
    { data: bands },
    { data: anchors },
    { data: responses },
    { data: supplierRel },
    { data: locationRel },
  ] = await Promise.all([
    supabase.from("categories").select("id,number,name,weight_pct,max_points").order("number"),
    supabase.from("metrics").select("id,number,category_id,input_type,max_points").order("number"),
    supabase.from("scoring_bands").select("metric_id,supplier_id,band_order,threshold_min,threshold_max,points").order("band_order"),
    supabase.from("likert_anchors").select("metric_id,score,points").order("score"),
    supabase.from("responses").select("metric_id,value_numeric,value_likert").eq("submission_id", submissionId),
    supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", sub.supplier_id).is("location_id", null),
    supabase.from("metric_relevance").select("metric_id,is_relevant").eq("supplier_id", sub.supplier_id).eq("location_id", sub.location_id),
  ]);

  // 3. Build relevance map — location overrides supplier defaults
  const relevanceMap: Record<string, boolean> = {};
  (metrics || []).forEach(m => { relevanceMap[m.id] = true; });
  (supplierRel || []).forEach(r => { relevanceMap[r.metric_id] = r.is_relevant; });
  (locationRel || []).forEach(r => { relevanceMap[r.metric_id] = r.is_relevant; });

  // 4. Response map
  const responseMap: Record<string, { value_numeric: number | null; value_likert: number | null }> = {};
  (responses || []).forEach(r => { responseMap[r.metric_id] = r; });

  // 5. Points resolver
  const resolvePoints = (metric: any): number | null => {
    const response = responseMap[metric.id];
    if (!response) return null;

    if (metric.input_type === "likert") {
      if (response.value_likert === null || response.value_likert === undefined) return null;
      const anchor = (anchors || []).find(a => a.metric_id === metric.id && a.score === response.value_likert);
      if (anchor?.points !== null && anchor?.points !== undefined) return Number(anchor.points);
      // Fallback linear if no anchor found
      return (response.value_likert / 5) * Number(metric.max_points);
    }

    if (response.value_numeric === null || response.value_numeric === undefined) return null;
    const val = Number(response.value_numeric);
    const metricBands = (bands || []).filter(b => b.metric_id === metric.id);
    // Prefer supplier-specific bands, fall back to generic
    const supplierBands = metricBands.filter(b => b.supplier_id === sub.supplier_id);
    const activeBands = supplierBands.length > 0
      ? supplierBands
      : metricBands.filter(b => !b.supplier_id);
    if (!activeBands.length) return null;
    const sorted = [...activeBands].sort((a, b) => a.band_order - b.band_order);
    for (const band of sorted) {
      if (val >= Number(band.threshold_min) && val <= Number(band.threshold_max)) return Number(band.points);
    }
    return 0;
  };

  // 6. Calculate per-category scores
  const categoryScores: CategoryScore[] = [];
  let totalNormalized = 0;
  let totalAnswered = 0;
  let totalRelevant = 0;

  for (const cat of (categories || [])) {
    const catMetrics = (metrics || []).filter(m => m.category_id === cat.id);
    const relevantMetrics = catMetrics.filter(m => relevanceMap[m.id] !== false);

    let pointsEarned = 0;
    let maxRelevant = 0;
    let answered = 0;

    for (const m of relevantMetrics) {
      const pts = resolvePoints(m);
      if (pts !== null) {
        pointsEarned += pts;
        maxRelevant += Number(m.max_points);
        answered++;
      }
      // Unanswered: excluded from both numerator and denominator
    }

    const normalized = maxRelevant > 0
      ? (pointsEarned / maxRelevant) * Number(cat.weight_pct)
      : 0;

    categoryScores.push({
      category_id: cat.id,
      category_name: cat.name,
      category_number: Number(cat.number),
      category_weight: Number(cat.weight_pct),
      points_earned: round2(pointsEarned),
      max_points_relevant: round2(maxRelevant),
      normalized_score: round2(normalized),
      pct_score: maxRelevant > 0 ? round2((pointsEarned / maxRelevant) * 100) : 0,
      metrics_answered: answered,
      metrics_relevant: relevantMetrics.length,
    });

    totalNormalized += normalized;
    totalAnswered += answered;
    totalRelevant += relevantMetrics.length;
  }

  const totalScore = round2(totalNormalized);

  // 7. Update response.points_earned in DB
  const updatePromises: Promise<any>[] = [];
  for (const m of (metrics || [])) {
    const pts = resolvePoints(m);
    if (pts !== null) {
      updatePromises.push(
        supabase.from("responses")
          .update({ points_earned: pts })
          .eq("submission_id", submissionId)
          .eq("metric_id", m.id)
      );
    }
  }
  await Promise.all(updatePromises);

  // 8. Persist scores — delete then re-insert (idempotent)
  await Promise.all([
    supabase.from("category_scores").delete().eq("submission_id", submissionId),
    supabase.from("overall_scores").delete().eq("submission_id", submissionId),
  ]);

  await supabase.from("category_scores").insert(
    categoryScores.map(cs => ({
      submission_id: submissionId,
      category_id: cs.category_id,
      points_earned: cs.points_earned,
      max_points_relevant: cs.max_points_relevant,
      normalized_score: cs.normalized_score,
    }))
  );

  await supabase.from("overall_scores").insert({
    submission_id: submissionId,
    total_score: totalScore,
    score_pct: totalScore,
  });

  return {
    submission_id: submissionId,
    category_scores: categoryScores,
    total_score: totalScore,
    score_pct: totalScore,
    metrics_answered: totalAnswered,
    metrics_relevant: totalRelevant,
    completeness_pct: totalRelevant > 0 ? Math.round((totalAnswered / totalRelevant) * 100) : 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
