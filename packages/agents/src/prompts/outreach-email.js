export const EMAIL_PROMPT = `Write a cold outreach email for this prospect.

RULES:
- Subject line must be specific to the prospect's business (no generic "partnership opportunity")
- Opening must reference a real observation about their business or website
- Body must present the completed MVP prototype as proof of work done
- Include the deployed prototype link
- Include a Calendly link for booking a kickoff call
- Close with a single clear CTA
- Keep under 200 words
- Professional but conversational tone
- Include proper unsubscribe/opt-out footer for CAN-SPAM compliance

NEVER:
- Use fake urgency ("only 3 spots left!")
- Claim you already built their production site
- Fabricate performance metrics
- Pretend you have a prior relationship
- Use generic template language

INPUT: prospect record, audit/research findings, deployed MVP URL, Calendly link

OUTPUT: subject line + email body (HTML and plain text versions)`;
