/**
 * Canonical prospect record shape.
 * Fields align with Explorium's fetch-prospects + enrich-prospects output.
 */
export const PROSPECT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "full_name",
  "executive_role",
  "company_name",
  "company_website",
  "email",
  "phone_number",
  "linkedin_url",
  "country",
  "city_or_region",
  "company_size_estimate",
  "industry",
  "website_status",
  "audit_summary",
  "budget_fit_estimate",
  "icp_score",
  "status",
  "outreach_status",
  "outreach_channel_status",
  "outreach",
  "deployment_url",
  "calendly_link_used",
  "notes",
  "source_trace",
  "created_at",
  "updated_at",
];

export function createProspect(data = {}) {
  const now = new Date().toISOString();
  const status = data.status || data.outreach_status || "discovered";
  return {
    id: data.id || crypto.randomUUID(),
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    full_name: data.full_name || null,
    executive_role: data.executive_role || data.role || null,
    company_name: data.company_name || data.company || null,
    company_website: data.company_website || data.website || null,
    email: data.email || null,
    phone_number: data.phone_number || data.phone || null,
    linkedin_url: data.linkedin_url || null,
    country: data.country || null,
    city_or_region: data.city_or_region || data.city || null,
    company_size_estimate: data.company_size_estimate || data.company_size || null,
    industry: data.industry || null,
    website_status: data.website_status || "unknown",
    audit_summary: data.audit_summary || null,
    budget_fit_estimate: data.budget_fit_estimate || null,
    icp_score: data.icp_score || null,
    status,
    outreach_status: status,
    outreach_channel_status: data.outreach_channel_status || {},
    outreach: data.outreach || {},
    deployment_url: data.deployment_url || null,
    calendly_link_used: data.calendly_link_used || null,
    notes: data.notes || null,
    source_trace: data.source_trace || null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
