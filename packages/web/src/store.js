const STORAGE_KEY = "outreach_tool_data";

const SEED_PROSPECTS = [
  {
    id: "p1",
    first_name: "James", last_name: "Whitfield", company: "Whitfield Plumbing", role: "Owner",
    email: "james@whitfieldplumbing.co.uk", phone: "+44 7700 900123",
    linkedin_url: "https://linkedin.com/in/jameswhitfield", country: "GB", city: "Manchester",
    website: "whitfieldplumbing.co.uk", industry: "Home Services", company_size: "8",
    status: "qualified", icp_score: 87,
    website_status: "outdated",
    audit_summary: "Homepage lacks clear CTA. No mobile optimization. Trust signals missing. Contact form buried. Good service descriptions but poor visual hierarchy.",
    outreach: {
      email: { status: "draft", subject: "James - I redesigned Whitfield Plumbing's website", body: "Hi James,\n\nI came across Whitfield Plumbing while researching established plumbing businesses in Manchester. Your reputation clearly speaks for itself with 15+ years of service.\n\nI noticed your website could be working harder for you - the homepage doesn't highlight your emergency services prominently, and the contact form is a few clicks deep.\n\nI went ahead and built a modern website concept for Whitfield Plumbing as a proof of what's possible:\n\nhttps://whitfield-plumbing-mvp.vercel.app\n\nIt's mobile-first, highlights your key services above the fold, and makes it dead simple for customers to request a quote.\n\nWould you be open to a 15-minute call to walk through it?\n\nBook a time here: https://calendly.com/outreach/kickoff\n\nBest,\nOutreach Team\n\n---\nYou're receiving this because we think Whitfield Plumbing would benefit from a stronger web presence. Reply STOP to opt out." },
      whatsapp: { status: "draft", message: "Hi James, I saw Whitfield Plumbing's website and thought it could be doing more for you. I actually built a quick redesign concept - check it out: whitfield-plumbing-mvp.vercel.app\n\nHappy to walk you through it if you're interested. Here's my calendar: calendly.com/outreach/kickoff" },
      linkedin: { status: "draft", connection_note: "Hi James - fellow Manchester business supporter here. Built a website concept for Whitfield Plumbing, would love your thoughts.", inmail: "Hi James,\n\nI noticed Whitfield Plumbing has built a great reputation in Manchester but your website might not be reflecting that fully.\n\nI put together a modern redesign concept: whitfield-plumbing-mvp.vercel.app\n\nWould love 15 minutes to walk you through it: calendly.com/outreach/kickoff" },
      voice_note: { status: "draft", script: "Hey James, [pause] this is a quick message about Whitfield Plumbing's website. [pause] I came across your business and honestly, your reputation is great, but I think your website could be working a lot harder for you. [pause] So I went ahead and actually built a redesign concept - it's live, you can check it out. [pause] I'll drop the link in a follow-up message. Would love to chat for 15 minutes if you think it's worth exploring. [pause] Cheers." }
    },
    notes: "Strong local reputation. Website is functional but outdated. Good candidate for conversion-focused redesign.",
    created_at: "2026-03-20T10:00:00Z"
  },
  {
    id: "p2",
    first_name: "Sarah", last_name: "Al-Rashid", company: "Bloom Interiors", role: "Founder",
    email: "sarah@bloominteriors.ae", phone: "+971 50 123 4567",
    linkedin_url: "https://linkedin.com/in/sarahalrashid", country: "AE", city: "Dubai",
    website: null, industry: "Interior Design", company_size: "12",
    status: "design_generated", icp_score: 92,
    website_status: "none",
    audit_summary: "No website exists. Active Instagram presence (8K followers). Company appears legitimate with physical showroom in Dubai Design District. Services include residential and commercial interior design. Primary trust signals via social media portfolio.",
    outreach: {
      email: { status: "draft", subject: "Sarah - a website concept for Bloom Interiors", body: "Hi Sarah,\n\nI've been following Bloom Interiors on Instagram and your portfolio is stunning. The Al Wasl Road residential project especially caught my eye.\n\nI noticed you don't have a website yet, so I took the initiative and designed one for Bloom Interiors:\n\nhttps://bloom-interiors-mvp.vercel.app\n\nIt showcases your portfolio beautifully, has a project inquiry form, and is designed to convert visitors into consultations.\n\nWould you be open to a quick 15-minute walkthrough?\n\nBook here: https://calendly.com/outreach/kickoff\n\nBest regards,\nOutreach Team\n\n---\nReply STOP to opt out." },
      whatsapp: { status: "draft", message: "Hi Sarah! I love what you're doing with Bloom Interiors - your Instagram portfolio is beautiful. I designed a website concept for you: bloom-interiors-mvp.vercel.app\n\nIt's ready to go - would love to walk you through it: calendly.com/outreach/kickoff" },
      linkedin: { status: "draft", connection_note: "Hi Sarah - love Bloom Interiors' work. I designed a website concept for your studio, would love to share it.", inmail: "Hi Sarah,\n\nYour work at Bloom Interiors is impressive - especially the residential projects in Dubai Design District.\n\nI noticed you don't have a dedicated website yet, so I built one: bloom-interiors-mvp.vercel.app\n\nWould love to walk you through it: calendly.com/outreach/kickoff" },
      voice_note: { status: "draft", script: "Hi Sarah, [pause] I wanted to reach out about Bloom Interiors. [pause] I've been looking at your Instagram and your design work is really impressive. [pause] I noticed you don't have a website yet, so I actually went ahead and built one for you. [pause] It showcases your portfolio, has a consultation booking form, and it's live right now. [pause] I'll send the link - would love to hear what you think. [pause] Thanks!" }
    },
    notes: "No website but strong social presence. High-value service business in Dubai. Excellent ICP fit.",
    created_at: "2026-03-20T10:15:00Z"
  },
  {
    id: "p3",
    first_name: "Marcus", last_name: "Johnson", company: "Peak Fitness Studio", role: "CEO",
    email: "marcus@peakfitness.com", phone: "+1 512 555 0198",
    linkedin_url: "https://linkedin.com/in/marcusjohnson", country: "US", city: "Austin, TX",
    website: "peakfitnessstudio.com", industry: "Fitness", company_size: "15",
    status: "deployed", icp_score: 78,
    website_status: "weak",
    audit_summary: "Website exists but has significant issues: slow load time (4.2s), not mobile responsive, class schedule is a PDF download, no online booking integration, stock photos instead of real gym photos. CTA is 'Contact Us' buried in footer.",
    outreach: {
      email: { status: "sent", subject: "Marcus - Peak Fitness deserves a better website", body: "Hi Marcus,\n\nI checked out Peak Fitness Studio's website and I can see you've built something solid in Austin. But I think your website is leaving members on the table.\n\nThe class schedule being a PDF download, no mobile optimization, and the booking flow could all be smoother.\n\nSo I built an improved version:\n\nhttps://peak-fitness-mvp.vercel.app\n\nIt has inline class scheduling, mobile-first design, and a prominent 'Start Free Trial' CTA.\n\nWorth a 15-minute look?\n\nBook here: https://calendly.com/outreach/kickoff\n\nBest,\nOutreach Team\n\n---\nReply STOP to opt out." },
      whatsapp: { status: "sent", message: "Hey Marcus - I looked at Peak Fitness Studio's site and built an upgraded version with online class booking and mobile design: peak-fitness-mvp.vercel.app\n\nFree to chat? calendly.com/outreach/kickoff" },
      linkedin: { status: "sent", connection_note: "Hi Marcus - built a website upgrade concept for Peak Fitness Studio. Would love your take on it.", inmail: "Hi Marcus,\n\nPeak Fitness clearly has momentum in Austin. I think a website upgrade could help convert more walk-ins and trial signups.\n\nI built one: peak-fitness-mvp.vercel.app\n\nHappy to walk you through it: calendly.com/outreach/kickoff" },
      voice_note: { status: "sent", script: "Hey Marcus, [pause] quick message about Peak Fitness Studio. [pause] I took a look at your current site and I think there's a real opportunity to convert more visitors into trial members. [pause] I built a redesigned version with inline class scheduling and a mobile-first layout. [pause] It's live - I'll send the link. [pause] Would love fifteen minutes to walk you through it." }
    },
    notes: "Website deployed. All outreach sent. Awaiting response.",
    created_at: "2026-03-20T09:30:00Z"
  },
  {
    id: "p4",
    first_name: "Elena", last_name: "Marchetti", company: "Verde Landscaping", role: "Director",
    email: "elena@verdelandscaping.co.uk", phone: "+44 7700 900456",
    linkedin_url: "https://linkedin.com/in/elenamarchetti", country: "GB", city: "Bristol",
    website: "verdelandscaping.co.uk", industry: "Landscaping", company_size: "6",
    status: "sent", icp_score: 81,
    website_status: "outdated",
    audit_summary: "Basic WordPress site. Outdated theme, slow hosting. Gallery has good project photos but poor layout. No clear pricing or service tiers. Contact page is just an email address. No testimonials visible despite Google reviews (4.6 stars).",
    outreach: {
      email: { status: "sent", subject: "Elena - Verde Landscaping's Google reviews deserve a better home", body: "Hi Elena,\n\nVerde Landscaping has a 4.6-star rating on Google - that's exceptional. But I noticed your website doesn't showcase those reviews or make it easy for new clients to request a quote.\n\nI built a concept that fixes that:\n\nhttps://verde-landscaping-mvp.vercel.app\n\nIt features your project gallery prominently, pulls in your Google reviews, and has a simple quote request form.\n\nWorth a quick look? Book 15 minutes: https://calendly.com/outreach/kickoff\n\nBest,\nOutreach Team\n\n---\nReply STOP to opt out." },
      whatsapp: { status: "sent", message: "Hi Elena - Verde Landscaping's 4.6-star Google rating should be front and centre on your website. I built a concept that does exactly that: verde-landscaping-mvp.vercel.app\n\nHappy to chat: calendly.com/outreach/kickoff" },
      linkedin: { status: "draft", connection_note: "Hi Elena - impressed by Verde Landscaping's reviews. Built a website concept that showcases them properly.", inmail: "" },
      voice_note: { status: "draft", script: "" }
    },
    notes: "Email and WhatsApp sent. LinkedIn pending. Good Google reviews to leverage.",
    created_at: "2026-03-20T11:00:00Z"
  },
  {
    id: "p5",
    first_name: "Ahmed", last_name: "Khalil", company: "Khalil Auto", role: "Managing Director",
    email: "ahmed@khalilauto.ae", phone: "+971 55 987 6543",
    linkedin_url: "https://linkedin.com/in/ahmedkhalil", country: "AE", city: "Abu Dhabi",
    website: null, industry: "Automotive Services", company_size: "20",
    status: "enriched", icp_score: 74,
    website_status: "none",
    audit_summary: "No website. Business verified through Google Maps listing and trade license records. Auto repair and maintenance services. 3 locations in Abu Dhabi. Appears well-established but entirely offline presence.",
    outreach: {
      email: { status: "pending", subject: "", body: "" },
      whatsapp: { status: "pending", message: "" },
      linkedin: { status: "pending", connection_note: "", inmail: "" },
      voice_note: { status: "pending", script: "" }
    },
    notes: "Enriched but not yet qualified. Needs more research on budget capacity.",
    created_at: "2026-03-20T11:30:00Z"
  },
  {
    id: "p6",
    first_name: "Rebecca", last_name: "Torres", company: "Torres Law Group", role: "Partner",
    email: "rtorres@torreslawgroup.com", phone: "+1 305 555 0234",
    linkedin_url: "https://linkedin.com/in/rebeccatorres", country: "US", city: "Miami, FL",
    website: "torreslawgroup.com", industry: "Legal Services", company_size: "10",
    status: "meeting_booked", icp_score: 95,
    website_status: "weak",
    audit_summary: "Website exists but critically underperforms: generic template, no attorney bios, no practice area detail, no client testimonials, stock courthouse photos. For a law firm, trust is everything and this site builds none.",
    outreach: {
      email: { status: "replied", subject: "Rebecca - Torres Law Group deserves a website that builds trust", body: "Hi Rebecca,\n\nI reviewed Torres Law Group's website and for a firm with your track record in Miami, I think it's underselling you significantly.\n\nNo attorney bios, no case results, no client testimonials - for legal services, trust is everything.\n\nI built a concept that addresses all of that:\n\nhttps://torres-law-mvp.vercel.app\n\nIt features attorney profiles, practice area pages, a client testimonials section, and a free consultation booking form.\n\nWorth 15 minutes? https://calendly.com/outreach/kickoff\n\nBest,\nOutreach Team" },
      whatsapp: { status: "replied", message: "Hi Rebecca - I reviewed Torres Law Group's site and built a concept that properly showcases your team and practice areas: torres-law-mvp.vercel.app\n\nWould love to walk you through it: calendly.com/outreach/kickoff" },
      linkedin: { status: "replied", connection_note: "Hi Rebecca - built a website concept for Torres Law Group that properly builds client trust.", inmail: "Hi Rebecca, your firm's reputation deserves a website that reflects it. I built one: torres-law-mvp.vercel.app" },
      voice_note: { status: "sent", script: "Hi Rebecca, [pause] this is about Torres Law Group's online presence. [pause] I looked at your current website and honestly, for a firm with your track record, it's not doing you justice. [pause] I built a redesign that features your team properly, highlights your practice areas, and includes client testimonials. [pause] It's live right now - I'll send the link. [pause] I'd love fifteen minutes to walk you through it. Thanks!" }
    },
    notes: "HIGH VALUE. Replied positively on email and WhatsApp. Kickoff call booked for Mar 24 at 2pm EST.",
    created_at: "2026-03-20T08:00:00Z"
  },
  {
    id: "p7",
    first_name: "David", last_name: "Park", company: "Park Dental Care", role: "Owner",
    email: "david@parkdentalcare.com", phone: "+1 312 555 0567",
    linkedin_url: "", country: "US", city: "Chicago, IL",
    website: "parkdentalcare.com", industry: "Healthcare", company_size: "5",
    status: "discovered", icp_score: 68,
    website_status: "unknown",
    audit_summary: "",
    outreach: {
      email: { status: "pending", subject: "", body: "" },
      whatsapp: { status: "pending", message: "" },
      linkedin: { status: "pending", connection_note: "", inmail: "" },
      voice_note: { status: "pending", script: "" }
    },
    notes: "Just discovered. Needs enrichment and website audit.",
    created_at: "2026-03-20T12:00:00Z"
  },
  {
    id: "p8",
    first_name: "Fatima", last_name: "Noor", company: "Noor Consulting", role: "Founder",
    email: "fatima@noorconsulting.ae", phone: "+971 50 456 7890",
    linkedin_url: "https://linkedin.com/in/fatimanoor", country: "AE", city: "Dubai",
    website: null, industry: "Business Consulting", company_size: "4",
    status: "qualified", icp_score: 83,
    website_status: "none",
    audit_summary: "No website. LinkedIn profile active with regular thought leadership posts. Company page has 500+ followers. Services include strategy consulting for SMEs in GCC region. Clear value proposition but no web presence to support it.",
    outreach: {
      email: { status: "draft", subject: "Fatima - a website for Noor Consulting", body: "Hi Fatima,\n\nI've been following your LinkedIn content and Noor Consulting clearly has strong expertise in GCC strategy consulting.\n\nHaving a professional website would give potential clients a place to learn about your services, read case studies, and book a consultation directly.\n\nI built a concept:\n\nhttps://noor-consulting-mvp.vercel.app\n\nIt positions your expertise, highlights your GCC focus, and makes it easy to book a discovery call.\n\nWorth a look? https://calendly.com/outreach/kickoff\n\nBest,\nOutreach Team\n\n---\nReply STOP to opt out." },
      whatsapp: { status: "draft", message: "Hi Fatima! Your LinkedIn content is excellent - Noor Consulting deserves a website that matches. I designed one: noor-consulting-mvp.vercel.app\n\nWould love to show you: calendly.com/outreach/kickoff" },
      linkedin: { status: "draft", connection_note: "Hi Fatima - love your GCC consulting insights. Built a website concept for Noor Consulting.", inmail: "" },
      voice_note: { status: "draft", script: "Hi Fatima, [pause] quick message about Noor Consulting. [pause] I've been reading your LinkedIn posts and your expertise in GCC strategy consulting is clear. [pause] I think a professional website would be a great complement to your LinkedIn presence. [pause] So I actually designed one - it's live and I'll send the link. [pause] Would love your thoughts. Thanks!" }
    },
    notes: "Strong LinkedIn presence. No website. Good fit for consulting-focused MVP.",
    created_at: "2026-03-20T11:45:00Z"
  }
];

function getDefaultData() {
  return {
    prospects: SEED_PROSPECTS,
    activity: [
      { id: "a1", type: "tool", tool: "fetch_businesses", detail: "Returned 12 SMEs in GB matching web design criteria", ts: Date.now() - 120000 },
      { id: "a2", type: "qualify", prospect: "p6", detail: "Rebecca Torres qualified with ICP score 95", ts: Date.now() - 240000 },
      { id: "a3", type: "tool", tool: "build_site", detail: "Generated 5-page MVP for Bloom Interiors (AE)", ts: Date.now() - 480000 },
      { id: "a4", type: "tool", tool: "deploy_to_vercel", detail: "Shipped Peak Fitness Studio prototype", ts: Date.now() - 720000 },
      { id: "a5", type: "tool", tool: "take_screenshot", detail: "Captured homepage proof for Peak Fitness Studio", ts: Date.now() - 780000 },
      { id: "a6", type: "tool", tool: "send_email", detail: "Delivered outreach to Elena Marchetti", ts: Date.now() - 1080000 },
      { id: "a7", type: "booked", prospect: "p6", detail: "Rebecca Torres booked kickoff call via Calendly for Mar 24", ts: Date.now() - 1500000 },
      { id: "a8", type: "tool", tool: "autocomplete", detail: "Validated linkedin_category: Web Design", ts: Date.now() - 1920000 },
      { id: "a9", type: "tool", tool: "check_suppression", detail: "Cleared Ahmed Khalil - no prior contact", ts: Date.now() - 2100000 },
      { id: "a10", type: "tool", tool: "voice_note_script", detail: "Generated 45s script for James Whitfield", ts: Date.now() - 2460000 },
    ],
  };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const data = getDefaultData();
  saveData(data);
  return data;
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData() {
  const data = getDefaultData();
  saveData(data);
  return data;
}

export function getProspect(id) {
  const data = loadData();
  return data.prospects.find((p) => p.id === id);
}

export function updateProspect(id, updates) {
  const data = loadData();
  const idx = data.prospects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  data.prospects[idx] = { ...data.prospects[idx], ...updates };
  saveData(data);
  return data.prospects[idx];
}

export function addActivity(entry) {
  const data = loadData();
  data.activity.unshift({ ...entry, id: "a" + Date.now(), ts: Date.now() });
  if (data.activity.length > 50) data.activity = data.activity.slice(0, 50);
  saveData(data);
}
