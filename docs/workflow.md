# Workflow State Machine

## Stages

1. `discovered` -- prospect identified via Explorium
2. `enriched` -- business and contact data enriched
3. `qualified` -- passed ICP qualification gates
4. `audited_or_researched` -- website audited or company researched
5. `design_brief_ready` -- design brief created from audit/research
6. `design_generated` -- Stitch design created
7. `design_reviewed` -- design quality verified
8. `prototype_built` -- HTML exported and routed into clickable prototype
9. `deployed` -- prototype live on Vercel
10. `proof_captured` -- screenshots and demo recorded
11. `outreach_ready` -- all outreach assets generated
12. `sent` -- outreach delivered across channels
13. `responded` -- prospect replied
14. `meeting_booked` -- kickoff call scheduled via Calendly
15. `won` -- deal closed
16. `lost` -- deal lost
17. `suppressed` -- do-not-contact or objection received

---

## Allowed Transitions

```
discovered -> enriched
enriched -> qualified
qualified -> audited_or_researched
audited_or_researched -> design_brief_ready
design_brief_ready -> design_generated
design_generated -> design_reviewed
design_reviewed -> prototype_built
design_reviewed -> design_generated        (revision loop)
prototype_built -> deployed
deployed -> proof_captured
proof_captured -> outreach_ready
outreach_ready -> sent
sent -> responded
responded -> meeting_booked
meeting_booked -> won
meeting_booked -> lost

Any state -> suppressed
```

---

## Suppression Triggers

Move to `suppressed` when:

- Prospect explicitly objects to contact
- Legal issue identified
- Bad data / wrong contact confirmed
- Explicit do-not-contact request received
- Channel-specific opt-out received
- Compliance risk flagged

Suppression is terminal. No further outreach is permitted.

---

## Required Artifacts Per Stage

### discovered

- Raw prospect record from Explorium
- Source trace

### enriched

- Firmographics
- Contact details (email, phone, LinkedIn)
- Company website (if exists)

### qualified

- ICP score
- Qualification verdict (qualified / needs_review / disqualified)
- Qualification reasoning

### audited_or_researched

- Audit report (if website exists): verdict, issues, improvements, page structure
- Research notes (if no website): business model, services, trust needs, IA

### design_brief_ready

- Design brief: business summary, persona, conversion goal, page list, visual direction

### design_generated

- Stitch project ID
- Screen IDs
- Prompt/spec used

### design_reviewed

- Review verdict (approved / revision_needed)
- Reviewer notes
- Comparison data (if revised)

### prototype_built

- Route map (screen -> path)
- Local preview URL or build output path

### deployed

- Vercel deployment URL
- Deployment ID
- Verification notes (browsed, renders correctly)

### proof_captured

- Screenshot file paths
- Demo recording path/link (if available)

### outreach_ready

- Final email (subject + HTML + plain text)
- Final WhatsApp message
- Final LinkedIn message (connection note + InMail)
- Final voice note script
- Calendly link included in all assets

### sent

- Channel send status (email: sent/delivered, WhatsApp: queued, LinkedIn: queued, voice: queued)
- Send timestamps
- Message version IDs

### responded

- Reply content
- Reply channel
- Reply timestamp
- Sentiment (positive / neutral / negative / objection)

### meeting_booked

- Calendly event ID or link
- Scheduled date/time
- Attendees

### won

- Deal summary
- Contract/proposal reference

### lost

- Loss reason
- Follow-up eligibility

### suppressed

- Suppression reason
- Suppression date
- Channel(s) affected
