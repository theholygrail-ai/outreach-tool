import { config } from "@outreach-tool/shared/config";
import OpenAI from "openai";

const groq = new OpenAI({ apiKey: config.groq.apiKey, baseURL: config.groq.baseURL });

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return fallback;
  }
}

function compactProspectContext(p) {
  return {
    id: p.id,
    company_name: p.company_name,
    industry: p.industry,
    country: p.country,
    city_or_region: p.city_or_region,
    website: p.company_website,
    website_status: p.website_status,
    company_size_estimate: p.company_size_estimate,
    contact: {
      first_name: p.first_name,
      last_name: p.last_name,
      role: p.executive_role,
      email: p.email,
      phone_number: p.phone_number,
      linkedin_url: p.linkedin_url,
    },
    quality_score: p.quality_score,
    icp_score: p.icp_score,
    data_sources: p.data_sources || [],
    audit_summary: p.audit_summary || null,
    notes: p.notes || null,
    verification: p.verification || null,
    enrichment_details: p.enrichment_details || null,
    existing_outreach: p.outreach || null,
  };
}

export async function generateComprehensiveAuditInsights(prospect) {
  const context = compactProspectContext(prospect);
  const prompt =
    `You are a senior CRO and GTM audit analyst for SME outreach.\n` +
    `Analyze this prospect data and return highly practical findings for cold outreach personalization.\n` +
    `Focus on: conversion gaps, trust gaps, UX friction, funnel leaks, offer-positioning mismatches, and likely lost-lead causes.\n\n` +
    `Prospect context JSON:\n${JSON.stringify(context).slice(0, 26000)}\n\n` +
    `Return JSON only with this schema:\n` +
    `{\n` +
    `  "executive_summary": "string",\n` +
    `  "priority_gaps": [{"gap":"string","impact":"high|medium|low","evidence":"string","recommended_fix":"string"}],\n` +
    `  "unmet_needs": ["string"],\n` +
    `  "solution_proposals": [{"proposal":"string","expected_outcome":"string","why_now":"string"}],\n` +
    `  "messaging_angles": ["string"],\n` +
    `  "proof_points_to_use": ["string"],\n` +
    `  "risk_flags": ["string"]\n` +
    `}`;

  const response = await groq.chat.completions.create({
    model: config.groq.model,
    max_tokens: 2200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You produce rigorous, specific audits. No generic fluff. Use only provided context. " +
          "If evidence is weak, state uncertainty explicitly in risk_flags.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = safeJson(raw, {});
  return {
    executive_summary: parsed.executive_summary || "",
    priority_gaps: Array.isArray(parsed.priority_gaps) ? parsed.priority_gaps.slice(0, 8) : [],
    unmet_needs: Array.isArray(parsed.unmet_needs) ? parsed.unmet_needs.slice(0, 8) : [],
    solution_proposals: Array.isArray(parsed.solution_proposals) ? parsed.solution_proposals.slice(0, 8) : [],
    messaging_angles: Array.isArray(parsed.messaging_angles) ? parsed.messaging_angles.slice(0, 8) : [],
    proof_points_to_use: Array.isArray(parsed.proof_points_to_use) ? parsed.proof_points_to_use.slice(0, 8) : [],
    risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.slice(0, 8) : [],
    generated_at: new Date().toISOString(),
  };
}

export async function generateOutreachCopy(prospect, channel = "all") {
  const context = compactProspectContext(prospect);
  const prompt =
    `You are a cold outreach strategist.\n` +
    `Generate concise, personalized copy using the prospect's gaps/unmet needs and concrete solution proposals.\n` +
    `Avoid generic claims. Tie each message to business pain and likely upside.\n\n` +
    `Prospect context JSON:\n${JSON.stringify(context).slice(0, 26000)}\n\n` +
    `Channel requested: ${channel}\n\n` +
    `Return JSON only with this schema:\n` +
    `{\n` +
    `  "email_subject":"string",\n` +
    `  "email_body":"string",\n` +
    `  "whatsapp_message":"string",\n` +
    `  "linkedin_connection_note":"string",\n` +
    `  "linkedin_inmail":"string",\n` +
    `  "voice_script":"string"\n` +
    `}`;

  const response = await groq.chat.completions.create({
    model: config.groq.model,
    max_tokens: 2400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Write high-converting B2B outreach. Keep tone human and specific. " +
          "Do not fabricate metrics. Include one clear CTA.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = safeJson(raw, {});
  return {
    email_subject: parsed.email_subject || "",
    email_body: parsed.email_body || "",
    whatsapp_message: parsed.whatsapp_message || "",
    linkedin_connection_note: parsed.linkedin_connection_note || "",
    linkedin_inmail: parsed.linkedin_inmail || "",
    voice_script: parsed.voice_script || "",
    generated_at: new Date().toISOString(),
  };
}

