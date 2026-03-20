export const AUDIT_PROMPT = `You are auditing a prospect's website. Browse the site and evaluate:

1. Homepage clarity -- is the value proposition immediately clear?
2. Trust signals -- testimonials, certifications, client logos, about page
3. CTA placement -- are calls to action visible and compelling?
4. Mobile readiness -- responsive layout, tap targets, readability
5. Speed/perceived performance -- load feel, render quality
6. Navigation -- logical structure, findability
7. Visual hierarchy -- layout guides the eye to key content
8. Service clarity -- can a visitor understand what the business does in 5 seconds?
9. Contact paths -- phone, email, form, chat, map
10. Lead capture -- forms, popups, gated content, friction level
11. Social proof -- reviews, case studies, media mentions
12. Brand consistency -- colors, fonts, voice, imagery
13. Copy quality -- professional, persuasive, error-free
14. Technical issues -- broken links, console errors, mixed content
15. Conversion opportunities -- what's missing that could drive leads

OUTPUT FORMAT:
- Verdict: [Strong / Adequate / Weak / Critical]
- Top 5 Issues (ranked by conversion impact)
- Top 5 Improvements (ranked by ease + impact)
- Suggested MVP page structure
- Design angle for the replacement/improvement MVP`;
