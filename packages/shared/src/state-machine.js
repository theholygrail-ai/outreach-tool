export const STATES = {
  DISCOVERED: "discovered",
  ENRICHED: "enriched",
  QUALIFIED: "qualified",
  AUDITED_OR_RESEARCHED: "audited_or_researched",
  DESIGN_BRIEF_READY: "design_brief_ready",
  DESIGN_GENERATED: "design_generated",
  DESIGN_REVIEWED: "design_reviewed",
  PROTOTYPE_BUILT: "prototype_built",
  DEPLOYED: "deployed",
  PROOF_CAPTURED: "proof_captured",
  OUTREACH_READY: "outreach_ready",
  SENT: "sent",
  RESPONDED: "responded",
  MEETING_BOOKED: "meeting_booked",
  WON: "won",
  LOST: "lost",
  SUPPRESSED: "suppressed",
};

const TRANSITIONS = {
  [STATES.DISCOVERED]: [STATES.ENRICHED, STATES.SUPPRESSED],
  [STATES.ENRICHED]: [STATES.QUALIFIED, STATES.SUPPRESSED],
  [STATES.QUALIFIED]: [STATES.AUDITED_OR_RESEARCHED, STATES.SUPPRESSED],
  [STATES.AUDITED_OR_RESEARCHED]: [STATES.DESIGN_BRIEF_READY, STATES.SUPPRESSED],
  [STATES.DESIGN_BRIEF_READY]: [STATES.DESIGN_GENERATED, STATES.SUPPRESSED],
  [STATES.DESIGN_GENERATED]: [STATES.DESIGN_REVIEWED, STATES.SUPPRESSED],
  [STATES.DESIGN_REVIEWED]: [STATES.PROTOTYPE_BUILT, STATES.DESIGN_GENERATED, STATES.SUPPRESSED],
  [STATES.PROTOTYPE_BUILT]: [STATES.DEPLOYED, STATES.SUPPRESSED],
  [STATES.DEPLOYED]: [STATES.PROOF_CAPTURED, STATES.SUPPRESSED],
  [STATES.PROOF_CAPTURED]: [STATES.OUTREACH_READY, STATES.SUPPRESSED],
  [STATES.OUTREACH_READY]: [STATES.SENT, STATES.SUPPRESSED],
  [STATES.SENT]: [STATES.RESPONDED, STATES.SUPPRESSED],
  [STATES.RESPONDED]: [STATES.MEETING_BOOKED, STATES.SUPPRESSED],
  [STATES.MEETING_BOOKED]: [STATES.WON, STATES.LOST, STATES.SUPPRESSED],
  [STATES.WON]: [],
  [STATES.LOST]: [],
  [STATES.SUPPRESSED]: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(prospect, newState) {
  if (!canTransition(prospect.outreach_status, newState)) {
    throw new Error(
      `Invalid transition: ${prospect.outreach_status} -> ${newState}`
    );
  }
  return {
    ...prospect,
    outreach_status: newState,
    updated_at: new Date().toISOString(),
  };
}
