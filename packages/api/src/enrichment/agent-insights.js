/**
 * Lightweight "agent" passes: structured insights grounded in supplied facts only.
 */

/**
 * @param {object} facts — compact verification/enrichment summary (no secrets beyond what you already store)
 * @param {(system: string, user: string) => Promise<object>} askGroq
 */
export async function runVerificationInsightsAgent(facts, askGroq) {
  try {
    const r = await askGroq(
      "You are a B2B data-quality analyst for a prospecting system.\n" +
        "Rules:\n" +
        "- Only draw conclusions from the JSON facts provided.\n" +
        "- Never invent emails, phone numbers, URLs, or company attributes.\n" +
        "- If evidence is insufficient, say so explicitly.\n" +
        "- Be concise.",
      `Facts (JSON):\n${JSON.stringify(facts)}\n\n` +
        `Return JSON only:\n` +
        `{\n` +
        `  "summary": string (max 500 chars),\n` +
        `  "data_risks": string[] (max 5 short items),\n` +
        `  "recommended_follow_ups": string[] (max 5, operational suggestions only)\n` +
        `}`,
    );
    return {
      summary: r?.summary || null,
      data_risks: Array.isArray(r?.data_risks) ? r.data_risks.slice(0, 5) : [],
      recommended_follow_ups: Array.isArray(r?.recommended_follow_ups) ? r.recommended_follow_ups.slice(0, 5) : [],
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      summary: null,
      data_risks: [],
      recommended_follow_ups: [],
      error: err?.message || "insights_failed",
      generated_at: new Date().toISOString(),
    };
  }
}
