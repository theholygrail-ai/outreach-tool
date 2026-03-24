/**
 * Compare vendor/deep-enrich snapshot vs website extraction and provider signals.
 * Pure functions — no I/O.
 */

function normEmail(e) {
  return (e || "").trim().toLowerCase();
}

function normPhone(p) {
  return (p || "").replace(/\D/g, "");
}

function normName(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function nameOverlap(snapFirst, snapLast, webName) {
  if (!webName) return "unknown";
  const w = normName(webName);
  const tokens = w.split(" ").filter(Boolean);
  const sf = normName(snapFirst);
  const sl = normName(snapLast);
  if (!sf && !sl) return "unknown";
  const hitFirst = sf && tokens.some((t) => t === sf || sf.startsWith(t) || t.startsWith(sf));
  const hitLast = sl && tokens.some((t) => t === sl || sl.includes(t) || t.includes(sl));
  if (hitFirst && (hitLast || !sl)) return "match";
  if (hitFirst || hitLast) return "partial";
  return "mismatch";
}

function linkedinAgreement(snapLi, extractedSocial, prospectLi) {
  const final = normEmail(prospectLi);
  const s = normEmail(snapLi);
  if (!final && !s) return "unknown";
  if (final && s && final === s) return "match";
  const ex = normEmail(extractedSocial?.linkedin);
  if (final && ex && final === ex) return "match";
  if (s && ex && s === ex) return "match";
  if (final && s && final !== s) return "mismatch";
  return "partial";
}

/**
 * Generic email list agreement: snapshot vs any website email.
 */
function emailAgreement(snapshotEmail, extractedList, groqEmail, finalEmail) {
  const fin = normEmail(finalEmail);
  const snap = normEmail(snapshotEmail);
  const groq = normEmail(groqEmail);
  const list = (extractedList || []).map(normEmail).filter(Boolean);

  if (!fin && !snap) return { agreement: "unknown", conflict: false };

  if (snap && fin) {
    if (snap === fin) {
      const onSite = list.includes(fin) || (groq && normEmail(groq) === fin);
      return { agreement: onSite ? "match" : "partial", conflict: false };
    }
    const snapDomain = snap.split("@")[1];
    const finDomain = fin.split("@")[1];
    if (snapDomain && finDomain && snapDomain !== finDomain) {
      return { agreement: "mismatch", conflict: true };
    }
    return { agreement: "partial", conflict: false };
  }

  if (!snap && fin) {
    const onSite = list.includes(fin) || (groq && normEmail(groq) === fin);
    return { agreement: onSite ? "match" : "partial", conflict: false };
  }

  return { agreement: "unknown", conflict: false };
}

function phoneAgreement(snapshotPhone, extractedPhones, groqPhone, finalPhone) {
  const fin = normPhone(finalPhone);
  const snap = normPhone(snapshotPhone);
  const groq = normPhone(groqPhone);
  const list = (extractedPhones || []).map(normPhone).filter(Boolean);

  if (!fin && !snap) return { agreement: "unknown", conflict: false };
  if (snap && fin) {
    if (snap === fin) return { agreement: "match", conflict: false };
    if (snap.slice(-10) === fin.slice(-10)) return { agreement: "partial", conflict: false };
    return { agreement: "mismatch", conflict: true };
  }
  if (!snap && fin) {
    const onSite = list.includes(fin) || (groq && normPhone(groq) === fin);
    return { agreement: onSite ? "match" : "partial", conflict: false };
  }
  return { agreement: "unknown", conflict: false };
}

/**
 * @param {object} input
 * @param {object} [input.snapshot] — from takeEnrichmentSnapshot
 */
export function runCrossCheck(input) {
  const {
    snapshot,
    prospect,
    extracted_emails = [],
    extracted_phones = [],
    extracted_social = {},
    extracted_contact_email = null,
    extracted_contact_phone = null,
    extracted_contact_name = null,
    email_domain_mx_ok = false,
    abstract_email = null,
    company_registry_match = false,
    linkedin_audit = null,
  } = input;

  const emailResult = emailAgreement(
    snapshot?.email,
    extracted_emails,
    extracted_contact_email,
    prospect?.email,
  );

  const phoneResult = phoneAgreement(
    snapshot?.phone_number,
    extracted_phones,
    extracted_contact_phone,
    prospect?.phone_number,
  );

  const nameAgreement = nameOverlap(snapshot?.first_name, snapshot?.last_name, extracted_contact_name);

  let liField = linkedinAgreement(snapshot?.linkedin_url, extracted_social, prospect?.linkedin_url);

  /** @type {string[]} */
  const signals = [];
  if (linkedin_audit?.status === "verified" && prospect?.linkedin_url) {
    signals.push("linkedin_affiliation_verified");
    liField = "match";
  } else if (linkedin_audit?.status === "rejected" || linkedin_audit?.status === "company_page") {
    signals.push("linkedin_affiliation_rejected");
    liField = "mismatch";
  }

  if (email_domain_mx_ok) signals.push("email_domain_mx_ok");
  if (abstract_email && !abstract_email.error) {
    if (abstract_email.deliverability === "DELIVERABLE" || abstract_email.is_deliverable?.value === true) {
      signals.push("abstract_deliverable");
    }
    if (abstract_email.is_disposable_email?.value === true) signals.push("abstract_disposable");
    const qRaw = abstract_email.quality_score;
    if (qRaw != null && Number.isFinite(Number(qRaw))) {
      const q = Number(qRaw) <= 1 ? Number(qRaw) : Number(qRaw) / 100;
      if (q >= 0.7) signals.push("abstract_quality_high");
    }
  }
  if (company_registry_match) signals.push("company_registry_match");
  if (emailResult.conflict) signals.push("email_source_conflict");
  if (phoneResult.conflict) signals.push("phone_source_conflict");

  let dataValidity = 50;
  if (emailResult.agreement === "match") dataValidity += 20;
  else if (emailResult.agreement === "partial") dataValidity += 10;
  else if (emailResult.agreement === "mismatch") dataValidity -= 25;

  if (phoneResult.agreement === "match") dataValidity += 10;
  else if (phoneResult.agreement === "partial") dataValidity += 5;
  else if (phoneResult.agreement === "mismatch") dataValidity -= 10;

  if (nameAgreement === "match") dataValidity += 8;
  else if (nameAgreement === "partial") dataValidity += 4;
  else if (nameAgreement === "mismatch") dataValidity -= 5;

  if (liField === "match") dataValidity += 7;
  else if (liField === "partial") dataValidity += 3;
  else if (liField === "mismatch") dataValidity -= 5;

  if (signals.includes("linkedin_affiliation_rejected")) dataValidity -= 15;

  if (email_domain_mx_ok) dataValidity += 10;
  if (signals.includes("abstract_disposable")) dataValidity -= 30;
  if (signals.includes("abstract_deliverable") || signals.includes("abstract_quality_high")) dataValidity += 8;
  if (company_registry_match) dataValidity += 10;

  dataValidity = Math.max(0, Math.min(100, Math.round(dataValidity)));

  return {
    by_field: {
      email: emailResult.agreement,
      phone: phoneResult.agreement,
      name: nameAgreement,
      linkedin: liField,
    },
    conflicts: {
      email: emailResult.conflict,
      phone: phoneResult.conflict,
    },
    signals,
    data_validity_score: dataValidity,
  };
}
