export const LINKEDIN_PROMPT = `Write a LinkedIn connection request or InMail for this prospect.

RULES:
- Connection note: under 300 characters
- InMail: under 150 words
- Reference their role and company specifically
- Reference the prototype you built
- Include prototype link
- Include Calendly link
- Professional but not stiff

NEVER:
- Use generic networking language
- Pitch without context
- Claim mutual connections that don't exist

OUTPUT: connection note (300 chars) + optional InMail (150 words)`;
