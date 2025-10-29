# PR Team Analysis - Media Relations & Public Relations

**Date**: 2025-10-28
**Version**: 1.0
**Purpose**: Design comprehensive PR team with agents, workflows, and API integrations for media outlet leverage

---

## Executive Summary

Expand CFN Marketing Department with **PR & Media Relations** capability to:
- Distribute press releases to 10,000+ media outlets
- Build relationships with 500+ journalists in target verticals
- Monitor brand mentions across 50,000+ news sources
- Respond to media inquiries within 2 hours
- Manage crisis communications (24/7 monitoring + rapid response)

**Agents Required**: 12 PR specialists (Agents #46-57)
**MCP Servers**: 3 new servers (media-outreach, media-monitoring, press-distribution)
**Timeline**: 6 weeks (Phase 5 of n8n MCP Integration)
**Budget**: $22,000 development + $800/month infrastructure

---

## PR Team Structure

### Loop 3: Implementation Agents (8 agents)

#### Agent #46: Press Release Writer
**Role**: Create newsworthy press releases from company updates, product launches, milestones

**Responsibilities**:
- Transform marketing content into AP Style press releases
- Craft compelling headlines (8-10 words, active voice)
- Write inverted pyramid structure (most important info first)
- Include boilerplate company description
- Add media contact information

**Inputs**:
- Product launch announcements (from Agent #4: Content Strategist)
- Company milestones (funding rounds, customer milestones, partnerships)
- Industry research (from Agent #39: Market Research Strategist)

**Outputs**:
- Press release draft (AP Style, 400-600 words)
- Headline options (3 variants for A/B testing)
- Multimedia assets list (images, videos, infographics needed)

**CFN Skills Used**:
- None (writes locally, no API calls)

**Example Output**:
```
FOR IMMEDIATE RELEASE

OurStories Reaches 100,000 Families Preserving Memories with AI-Powered Platform

SAN FRANCISCO, CA — October 28, 2025 — OurStories, the leading AI-powered family
history preservation platform, today announced it has helped 100,000 families digitize
and preserve over 5 million historical photos and documents. This milestone comes just
18 months after the company's public launch and represents a 300% year-over-year growth.

"Every family has stories worth preserving," said [CEO Name], CEO of OurStories.
"Our AI technology makes it possible for anyone to restore century-old photos and build
comprehensive family trees in minutes, not months."

Key platform features include:
- AI-powered photo restoration (removes scratches, enhances faded colors)
- Automated family tree generation from uploaded documents
- Collaboration tools for multi-generational storytelling

About OurStories:
OurStories helps families preserve and share their heritage through AI-powered photo
restoration, family tree building, and collaborative storytelling tools. Founded in 2023,
the company serves 100,000+ families worldwide.

Media Contact:
[Name], Director of PR
press@ourstories.com
(555) 123-4567
```

---

#### Agent #47: Media Pitch Specialist
**Role**: Create personalized pitches to journalists, secure media coverage

**Responsibilities**:
- Research journalists by beat (family history, genealogy, AI/tech, lifestyle)
- Craft personalized pitches (reference recent articles, show relevance)
- Follow up on pitches (2-3 follow-ups over 7 days)
- Track response rates and optimize pitch templates

**Inputs**:
- Press release (from Agent #46)
- Journalist database (from MCP server: marketing-media-outreach)
- Recent journalist articles (from MCP server: marketing-media-monitoring)

**Outputs**:
- Personalized pitch emails (1-to-1, not templated mass emails)
- Follow-up sequence (Day 1, Day 3, Day 7)
- Pitch performance analytics (open rate, response rate by journalist)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-outreach/` (find journalists, send pitches)

**Example Output**:
```
Subject: AI Brings Century-Old Family Photos Back to Life [Pitch]

Hi Sarah,

I loved your recent TechCrunch article on AI applications in consumer products.
Your point about "AI solving real family problems, not just enterprise use cases"
resonated deeply.

I'm reaching out because OurStories just hit a milestone that perfectly illustrates
your thesis: 100,000 families have now used our AI to restore century-old photos that
were gathering dust in attics. We're seeing grandparents and grandchildren connecting
over family history in ways that weren't possible before.

A few data points that might interest you:
- 5 million historical photos restored (many from the 1920s-1940s)
- 82% of users are 50+ years old (AI adoption in unexpected demographics)
- Average restoration time: 30 seconds (vs 2-4 hours with Photoshop)

Would you be interested in an exclusive first look at our new AI video restoration
feature? We're launching next month and have some remarkable before/after examples
(1920s home movies brought to 4K quality).

Happy to send a demo link or arrange a call with our CEO.

Best,
[Name]
Director of PR, OurStories
press@ourstories.com

P.S. We also have user stories that would make great human-interest angles—like the
woman who discovered her grandmother was a WWII spy through restored documents.
```

---

#### Agent #48: Media Monitoring Analyst
**Role**: Track brand mentions, competitor coverage, industry news across 50,000+ sources

**Responsibilities**:
- Monitor real-time brand mentions (news, blogs, podcasts, social media)
- Analyze sentiment (positive, neutral, negative)
- Track share of voice vs competitors
- Identify trending stories in industry (genealogy, AI, family tech)
- Alert team to crisis situations (negative coverage, misinformation)

**Inputs**:
- Brand keywords ("OurStories", "family history AI", CEO name)
- Competitor brands (for benchmarking)
- Industry keywords ("genealogy", "photo restoration", "family tree")

**Outputs**:
- Daily brand mention report (15-20 mentions/day expected)
- Weekly sentiment analysis (85%+ positive target)
- Share of voice report (OurStories vs competitors)
- Crisis alerts (negative coverage, misinformation, brand attacks)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-monitoring/` (fetch mentions, analyze sentiment)

**Example Output**:
```
Daily Brand Mention Report - October 28, 2025

Total Mentions: 18
Positive: 14 (78%)
Neutral: 3 (17%)
Negative: 1 (5%)

Top Mentions:
1. TechCrunch: "OurStories Hits 100K Users, AI Photo Restoration Trend Accelerates"
   - Reach: 2.5M readers
   - Sentiment: Positive
   - Link: https://techcrunch.com/2025/10/28/ourstories-100k-users

2. Family Tree Magazine Blog: "Best AI Tools for Photo Restoration in 2025"
   - Reach: 45K readers
   - Sentiment: Positive (ranked #2 out of 10 tools)
   - Link: https://familytreemagazine.com/best-ai-photo-tools

3. Reddit r/Genealogy: User complaint about pricing
   - Reach: 850K subreddit members
   - Sentiment: Negative
   - Issue: User confused about free vs paid tiers
   - Recommended Action: Agent #51 (Crisis Comms) should respond with clarification

Share of Voice (This Week):
- OurStories: 35%
- Competitor A: 28%
- Competitor B: 22%
- Others: 15%

Industry Trends:
- "AI video restoration" mentions up 45% week-over-week
- "Family history apps" trending on Product Hunt
- Genealogy conference announcement (GenTech 2026) - opportunity to pitch speakers

Crisis Alerts: None (1 negative Reddit post, low severity)
```

---

#### Agent #49: Journalist Relationship Manager
**Role**: Build long-term relationships with key journalists, maintain media database

**Responsibilities**:
- Maintain CRM of 500+ journalists (beat, contact info, interaction history)
- Track journalist preferences (pitch style, embargo policies, exclusivity)
- Nurture relationships (share non-promotional industry insights, congratulate on bylines)
- Identify "friendly" journalists (high response rate, positive coverage history)
- Organize journalist briefings and events

**Inputs**:
- Journalist database (from MCP server: marketing-media-outreach)
- Pitch response history (from Agent #47)
- Media coverage history (from Agent #48)

**Outputs**:
- Journalist CRM (500+ contacts, updated weekly)
- Relationship health scores (0-100, based on engagement)
- Priority journalist list (top 50 for exclusive pitches)
- Quarterly journalist outreach plan (coffee chats, industry briefings)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-outreach/` (update journalist database)
- `.claude/skills/cfn-marketing-crm-contacts/` (CRM integration for journalist contacts)

**Example Output**:
```
Journalist Relationship Health Report - Q4 2025

Top 10 Priority Journalists (Relationship Score ≥ 85):

1. Sarah Johnson - TechCrunch
   - Beat: Consumer AI, Family Tech
   - Relationship Score: 92
   - Last Contact: October 15, 2025 (pitch accepted, article published)
   - Interaction History: 8 pitches sent, 3 accepted (38% acceptance rate)
   - Preferences: Prefers exclusive embargos (48 hours), data-driven stories
   - Next Action: Send exclusive early access to AI video restoration (November 2025)

2. Michael Chen - Wired
   - Beat: AI Ethics, Consumer Technology
   - Relationship Score: 88
   - Last Contact: September 20, 2025 (industry insight shared, no pitch)
   - Interaction History: 5 pitches sent, 1 accepted (20% acceptance rate)
   - Preferences: Loves human-interest angles, skeptical of PR fluff
   - Next Action: Invite to exclusive customer roundtable (December 2025)

3. Emily Rodriguez - Family Tree Magazine
   - Beat: Genealogy, Digital Tools
   - Relationship Score: 90
   - Last Contact: October 5, 2025 (quoted in article)
   - Interaction History: 6 pitches sent, 4 accepted (67% acceptance rate)
   - Preferences: Responds well to how-to content, product reviews
   - Next Action: Offer product review of new video restoration feature

Relationship Cultivation Plan (Next 30 Days):
- 15 coffee chats scheduled (mix of existing relationships + new targets)
- 3 industry briefings planned (AI in consumer apps, genealogy trends, family tech market)
- 10 non-promotional outreach (congratulate on recent bylines, share industry research)
```

---

#### Agent #50: HARO (Help A Reporter Out) Specialist
**Role**: Respond to journalist queries on HARO, secure opportunistic media coverage

**Responsibilities**:
- Monitor HARO queries 3x/day (morning, afternoon, evening)
- Identify relevant queries (genealogy, AI, family tech, consumer apps)
- Craft expert responses (CEO quotes, company data, case studies)
- Submit responses within 2 hours (time-sensitive)
- Track success rate (responses submitted vs coverage secured)

**Inputs**:
- HARO daily digests (via email or API)
- Company expertise areas (AI, genealogy, family history, photo restoration)
- Executive availability (CEO, CTO for high-value opportunities)

**Outputs**:
- HARO responses (2-5 per day)
- Coverage secured (1-2 per week expected)
- HARO performance analytics (response-to-coverage conversion rate)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-outreach/` (fetch HARO queries, submit responses)

**Example Input (HARO Query)**:
```
HARO Query - October 28, 2025

Category: Technology / Consumer Apps
Deadline: October 28, 2025, 5:00 PM EST

Query: I'm writing an article about AI applications that everyday families are using
(not enterprise). Looking for examples of AI solving real family problems, with data
on adoption rates among non-tech-savvy users (50+ years old demographic).

Requirements:
- Company name, spokesperson name/title
- Specific data points (user counts, demographics, use cases)
- 2-3 sentence quote from executive
- Available for follow-up questions

Contact: sarah.johnson@techcrunch.com
```

**Example Output (HARO Response)**:
```
Subject: RE: AI Applications for Everyday Families [HARO Response]

Hi Sarah,

Great query—this is exactly our wheelhouse at OurStories.

Company: OurStories (www.ourstories.com)
Spokesperson: [CEO Name], CEO & Co-Founder

Data Points:
- 100,000 families using our AI photo restoration platform
- 82% of users are 50+ years old (average age: 67)
- 5 million historical photos restored (many from 1920s-1940s)
- Average user completes their first restoration in under 5 minutes (no technical skills required)

Quote from CEO:
"We're seeing grandparents who've never used AI before restore century-old family photos in
minutes. The technology is invisible to them—they just see their grandmother's wedding photo
from 1942 come back to life. That's when AI moves from hype to real human impact."

Use Cases:
- WWII veteran restoring 1940s military photos for memoir
- Adoptee discovering birth family through restored documents
- Multi-generational family collaborating on digital family tree (grandparents upload photos,
  grandchildren add stories)

We have compelling before/after examples and can arrange a call with our CEO today if helpful.

Best,
[Name]
Director of PR, OurStories
press@ourstories.com
(555) 123-4567
```

---

#### Agent #51: Crisis Communications Manager
**Role**: Monitor for brand crises, coordinate rapid response, manage reputation during negative events

**Responsibilities**:
- 24/7 monitoring for crisis triggers (negative viral posts, product issues, executive controversies)
- Assess crisis severity (low, medium, high, critical)
- Coordinate crisis response team (PR, legal, customer support, engineering)
- Draft crisis response statements (within 2 hours of crisis identification)
- Manage media inquiries during crisis (holding statements, updates, resolutions)

**Inputs**:
- Real-time brand monitoring (from Agent #48: Media Monitoring)
- Social media sentiment (from MCP server: marketing-social-publishing)
- Customer support ticket trends (from CRM)

**Outputs**:
- Crisis severity assessment (within 15 minutes of detection)
- Crisis response statement (within 2 hours)
- Media inquiry responses (holding statements, Q&A documents)
- Post-crisis report (timeline, response effectiveness, lessons learned)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-monitoring/` (crisis detection)
- `.claude/skills/cfn-marketing-media-outreach/` (send crisis statements to media)

**Crisis Severity Levels**:
- **Low**: Single negative review, small blog mention (handle via customer support)
- **Medium**: Multiple negative social posts, minor product issue (PR statement + customer outreach)
- **High**: Trending negative hashtag, major product failure, executive controversy (full crisis protocol)
- **Critical**: Data breach, safety issue, legal action (activate legal team, executive involvement)

**Example Crisis Scenario**:
```
Crisis Alert - October 28, 2025, 2:15 PM

Trigger: Reddit post in r/Privacy goes viral (850 upvotes in 2 hours)
Title: "OurStories AI uploads your family photos to the cloud without consent"
Severity: HIGH (misinformation, privacy concerns, viral spread)

Assessment:
- Misinformation: Post claims we upload photos without consent (FALSE - all uploads require explicit opt-in)
- Viral potential: High (trending on r/Privacy, cross-posted to r/Technology)
- Sentiment: Negative (comments questioning data privacy, suggesting alternatives)
- Response urgency: Immediate (within 2 hours to prevent further spread)

Recommended Actions:
1. Draft factual correction statement (emphasize opt-in consent, local-first processing)
2. Post response on Reddit (transparent, non-defensive tone)
3. Update FAQ page with privacy clarification
4. Proactive outreach to tech media (preempt negative coverage)

Crisis Response Statement (DRAFT):
---
We've seen questions about OurStories' data privacy practices and want to clarify:

Facts:
- All photo uploads require explicit user consent (opt-in checkbox before any upload)
- Photos are processed locally on your device first (cloud upload is optional)
- Users can choose "local-only mode" (zero cloud uploads, all processing on-device)
- We never share photos with third parties or use them for AI training without consent

We take privacy seriously—especially for sensitive family photos. Our privacy policy is
here: [link]. Happy to answer specific questions.

- OurStories Team
---

Next Steps:
- Post response on Reddit (within 30 minutes)
- Monitor sentiment shift (target: 50% of comments acknowledge correction within 4 hours)
- Update FAQ page (add "Privacy & Data Security" section)
- Send preemptive statement to top 10 tech journalists (prevent negative coverage)
```

---

#### Agent #52: Press Kit Manager
**Role**: Maintain up-to-date press kit (logos, screenshots, executive bios, fact sheets)

**Responsibilities**:
- Curate press kit assets (high-res logos, product screenshots, executive headshots)
- Write fact sheets (company overview, product features, key statistics)
- Update press kit quarterly (new milestones, updated screenshots, revised messaging)
- Create industry-specific press kits (genealogy media, tech media, lifestyle media)
- Track press kit downloads and usage

**Inputs**:
- Company milestones (from marketing team)
- Product screenshots (from design team)
- Executive bios (from HR)
- Brand assets (from brand team)

**Outputs**:
- Online press kit (ourstories.com/press)
- Downloadable press kit ZIP (logos, screenshots, fact sheets)
- Industry-specific press kits (tailored messaging for different verticals)
- Press kit analytics (downloads, most-used assets)

**CFN Skills Used**:
- None (manages files locally, uploads to website)

**Example Press Kit Structure**:
```
OurStories Press Kit
(Available at: ourstories.com/press)

1. Company Overview
   - One-paragraph description
   - Fact sheet (founded, team size, funding, customer count)
   - Key milestones timeline

2. Logos & Brand Assets
   - Primary logo (PNG, SVG, EPS)
   - Wordmark (PNG, SVG, EPS)
   - Icon (PNG, SVG, EPS)
   - Color palette (hex codes, Pantone)
   - Usage guidelines (do's and don'ts)

3. Product Screenshots
   - AI photo restoration (before/after examples)
   - Family tree builder interface
   - Mobile app screenshots (iOS, Android)
   - Video restoration demo (GIF, MP4)

4. Executive Team
   - CEO headshot + bio (150 words)
   - CTO headshot + bio (150 words)
   - VP Product headshot + bio (150 words)

5. Media Coverage
   - "As Seen In" logos (TechCrunch, Wired, Family Tree Magazine)
   - Top 10 media mentions (headlines, links, dates)
   - Coverage highlights (pull quotes from articles)

6. Data & Statistics
   - 100,000 families served
   - 5 million photos restored
   - 82% of users are 50+ years old
   - 4.8/5 average rating (10,000+ reviews)
   - Available in 15 countries

7. Case Studies
   - "WWII Veteran Restores 1940s Military Photos for Memoir"
   - "Adoptee Discovers Birth Family Through Restored Documents"
   - "Multi-Generational Family Collaborates on Digital Heritage"

8. Media Contact
   - PR contact name, email, phone
   - Press inquiry form
   - Social media handles
```

---

#### Agent #53: Industry Analyst Relations Specialist
**Role**: Build relationships with industry analysts (Gartner, Forrester, IDC), secure analyst coverage

**Responsibilities**:
- Maintain analyst database (100+ analysts covering AI, genealogy, consumer tech)
- Organize analyst briefings (quarterly product updates, strategy sessions)
- Submit for analyst reports (Magic Quadrant, Wave, MarketScape)
- Track analyst mentions and recommendations
- Coordinate analyst events (Gartner Symposium, Forrester forums)

**Inputs**:
- Product roadmap (from product team)
- Company strategy (from executive team)
- Analyst research calendars (from analyst firms)

**Outputs**:
- Analyst briefing schedule (quarterly briefings with top 20 analysts)
- Analyst report submissions (Gartner Magic Quadrant, Forrester Wave)
- Analyst relations performance (mentions, recommendations, rankings)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-media-outreach/` (schedule analyst briefings)
- `.claude/skills/cfn-marketing-crm-contacts/` (CRM for analyst contacts)

**Example Output**:
```
Analyst Relations Plan - Q4 2025

Upcoming Analyst Briefings:

1. Gartner - AI in Consumer Applications
   - Date: November 15, 2025
   - Analyst: Jane Smith, VP Analyst
   - Focus: OurStories product roadmap, AI video restoration launch
   - Deliverables: Product demo, Q4 metrics, 2026 strategy preview

2. Forrester - Digital Family History Platforms Wave
   - Date: December 5, 2025
   - Analyst: Michael Brown, Principal Analyst
   - Focus: Submit for Forrester Wave report (publishes Q1 2026)
   - Deliverables: RFI response, customer references (3 enterprise clients)

3. IDC - Genealogy Software Market Share Report
   - Date: December 10, 2025
   - Analyst: Emily Chen, Research Director
   - Focus: Market share data, competitive positioning
   - Deliverables: Revenue data (confidential), user growth metrics

Analyst Report Submissions:

1. Gartner Magic Quadrant for AI-Powered Consumer Applications
   - Submission Deadline: January 15, 2026
   - Requirements: Product capabilities, customer count, revenue, vision
   - Goal: Challenger quadrant (realistic for first-time submission)

2. Forrester Wave: Digital Family History Platforms
   - Submission Deadline: November 30, 2025
   - Requirements: RFI response (50 questions), customer references (3), product demo
   - Goal: Strong Performer (top 5 out of 15 vendors)

Analyst Mentions (Last 90 Days):

1. Gartner: "Cool Vendors in AI for Consumer Applications" (July 2025)
   - Status: Mentioned as "Cool Vendor"
   - Impact: High (sales team reports increased inbound from enterprises)

2. Forrester: "The State of Digital Family History, 2025" (September 2025)
   - Status: Mentioned as "Emerging Vendor to Watch"
   - Impact: Medium (positive mention, but not featured prominently)

Next Steps:
- Prepare briefing materials for November/December analyst meetings
- Complete Forrester Wave RFI (due November 30)
- Identify 3 enterprise customer references for Forrester submission
```

---

### Loop 2: Validation Agents (3 agents)

#### Agent #54: Media Relations Validator
**Role**: Review press releases, pitches, and media responses for accuracy, brand consistency, AP Style compliance

**Responsibilities**:
- Validate press releases (AP Style, grammar, factual accuracy)
- Review media pitches (personalization quality, relevance to journalist beat)
- Check media responses for consistency (messaging aligns with brand guidelines)
- Verify data and claims (fact-check statistics, product claims, executive quotes)

**Inputs**:
- Press release drafts (from Agent #46)
- Media pitch drafts (from Agent #47)
- Crisis response statements (from Agent #51)

**Outputs**:
- Validation report (pass/iterate with specific feedback)
- AP Style corrections (grammar, punctuation, formatting)
- Fact-check results (data verified, sources cited)
- Loop 2 confidence score (0.0-1.0)

**CFN Skills Used**:
- None (reviews locally)

**Validation Checklist**:
- ✅ AP Style compliance (dateline, capitalization, abbreviations)
- ✅ Factual accuracy (statistics verified, product claims accurate)
- ✅ Brand consistency (tone, messaging, terminology)
- ✅ Legal compliance (no unsubstantiated claims, proper disclosures)
- ✅ SEO optimization (target keywords included, meta description)
- ✅ Contact information (media contact name, email, phone)

---

#### Agent #55: Media Coverage Quality Analyst
**Role**: Analyze media coverage quality, measure PR campaign effectiveness

**Responsibilities**:
- Assess coverage quality (Tier 1 vs Tier 2 vs Tier 3 publications)
- Calculate PR metrics (reach, impressions, AVE - Advertising Value Equivalency)
- Track key message pull-through (% of articles mentioning key messages)
- Measure share of voice vs competitors
- Generate PR campaign ROI reports

**Inputs**:
- Media coverage (from Agent #48: Media Monitoring)
- Media tier list (Tier 1: TechCrunch, Wired, NYT; Tier 2: Industry pubs; Tier 3: Blogs)
- PR campaign objectives (key messages, target audience, KPIs)

**Outputs**:
- Coverage quality report (Tier 1/2/3 breakdown, sentiment analysis)
- PR ROI calculation (cost per article, AVE, reach, impressions)
- Key message analysis (% of articles mentioning primary messages)
- Loop 2 confidence score (0.0-1.0)

**CFN Skills Used**:
- `.claude/skills/cfn-marketing-analytics-data/` (fetch coverage analytics)

**Example Output**:
```
PR Campaign Effectiveness Report - October 2025

Campaign: "100,000 Families Milestone" Press Release

Media Coverage Summary:
- Total articles: 12
- Tier 1 publications: 2 (TechCrunch, Wired)
- Tier 2 publications: 5 (Family Tree Magazine, Genealogy Today, AI Weekly, etc.)
- Tier 3 publications: 5 (Industry blogs, local news)

Reach & Impressions:
- Total reach: 8.5 million readers
- Total impressions (estimated): 12 million
- Average article reach: 708,333 readers

Advertising Value Equivalency (AVE):
- Total AVE: $425,000 (based on ad rate cards)
- Campaign cost: $5,000 (PR team time + distribution)
- ROI: 85:1 (every $1 spent generated $85 in ad value)

Sentiment Analysis:
- Positive: 10 articles (83%)
- Neutral: 2 articles (17%)
- Negative: 0 articles (0%)

Key Message Pull-Through:
- "AI-powered photo restoration": 11/12 articles (92%)
- "100,000 families served": 12/12 articles (100%)
- "82% of users are 50+ years old": 7/12 articles (58%)
- "5 million photos restored": 9/12 articles (75%)

Share of Voice (October 2025):
- OurStories: 42% (up from 35% in September)
- Competitor A: 31%
- Competitor B: 18%
- Others: 9%

Top Performing Article:
- TechCrunch: "OurStories Hits 100K Users, AI Photo Restoration Trend Accelerates"
- Reach: 2.5 million readers
- Social shares: 1,200
- Backlinks: 15 (SEO value: high)

Recommendations:
- ✅ Campaign highly effective (Tier 1 coverage, high reach, positive sentiment)
- ✅ Key message pull-through strong (>75% for most messages)
- 🔄 Improve "82% of users are 50+ years old" messaging (only 58% pull-through)
- 🔄 Leverage TechCrunch coverage for social media amplification

Loop 2 Confidence Score: 0.94 (campaign exceeded expectations)
```

---

#### Agent #56: Legal & Compliance Reviewer (PR Focus)
**Role**: Review PR materials for legal compliance, risk mitigation

**Responsibilities**:
- Review press releases for legal risk (unsubstantiated claims, competitor mentions)
- Validate crisis response statements (legal exposure, liability)
- Check data disclosures (privacy compliance, financial data accuracy)
- Approve executive quotes (no forward-looking statements without disclaimers)

**Inputs**:
- Press release drafts (from Agent #46)
- Crisis response statements (from Agent #51)
- Executive quotes (from various agents)

**Outputs**:
- Legal approval (approved / approved with changes / rejected)
- Risk assessment (low, medium, high legal risk)
- Recommended edits (remove unsubstantiated claims, add disclaimers)
- Loop 2 confidence score (0.0-1.0)

**CFN Skills Used**:
- None (reviews locally)

**Legal Review Checklist**:
- ✅ No unsubstantiated claims ("best AI photo restoration" → "leading AI photo restoration")
- ✅ Competitor mentions (factual comparisons only, no disparagement)
- ✅ Financial data (approved by finance team, no forward-looking statements)
- ✅ Customer data (no personally identifiable information, proper consents)
- ✅ Product claims (accurate, no exaggeration, substantiated by data)
- ✅ Forward-looking statements (include safe harbor disclaimer if needed)

---

### Product Owner: Marketing Director (Agent #13)

**Role**: Final approval for PR campaigns, crisis response, media strategy

**Responsibilities**:
- Approve press releases for distribution (PROCEED / ITERATE / ABORT)
- Approve crisis response statements (time-sensitive, within 30 minutes)
- Review quarterly PR strategy (media targets, campaign priorities, budget allocation)
- Make go/no-go decisions for high-risk PR activities (controversial statements, competitive attacks)

**Inputs**:
- Press release drafts (validated by Loop 2 agents)
- PR campaign performance (from Agent #55)
- Crisis assessments (from Agent #51)
- Media coverage reports (from Agent #48)

**Outputs**:
- PROCEED (distribute press release, execute campaign)
- ITERATE (revise messaging, adjust strategy, resubmit for approval)
- ABORT (too risky, not newsworthy, timing wrong)

**Decision Criteria**:
- Newsworthiness: Is this actually news? (milestone-based, data-driven, industry-relevant)
- Brand alignment: Does this reinforce our positioning? (AI innovation, family focus, accessibility)
- Risk assessment: What's the downside? (competitor response, legal exposure, backlash potential)
- Timing: Is this the right time? (avoid earnings blackouts, holidays, competitor news cycles)

---

## PR Workflows

### Workflow 1: Press Release Distribution

**Trigger**: Company milestone (funding, customer count, product launch)

**Process**:
1. **Agent #46** writes press release draft (400-600 words, AP Style)
2. **Loop 2 Validation**:
   - Agent #54 validates AP Style, factual accuracy
   - Agent #55 assesses newsworthiness potential
   - Agent #56 reviews legal compliance
   - Consensus threshold: ≥0.90
3. **Agent #13 (Marketing Director)** reviews and approves
4. **Agent #52** adds press release to press kit, updates fact sheet
5. **Agent #46** distributes via MCP server `marketing-press-distribution`:
   - PR Newswire (10,000+ outlets)
   - Business Wire (5,000+ outlets)
   - PRWeb (targeted industry outlets)
6. **Agent #47** sends personalized pitches to top 50 journalists (exclusive angles)
7. **Agent #48** monitors coverage for 7 days, generates coverage report
8. **Agent #55** analyzes coverage quality, calculates ROI

**Timeline**: 2 days (draft → approval → distribution → monitoring)

**Success Criteria**:
- ✅ Tier 1 coverage: 1-2 articles (TechCrunch, Wired, major publications)
- ✅ Tier 2 coverage: 3-5 articles (industry publications, trade media)
- ✅ Total reach: 5 million+ readers
- ✅ Positive sentiment: ≥80%
- ✅ Key message pull-through: ≥75%

---

### Workflow 2: Media Pitch Campaign

**Trigger**: Product launch, new feature, industry trend opportunity

**Process**:
1. **Agent #49** identifies top 50 priority journalists (relationship score ≥70)
2. **Agent #47** creates personalized pitch template (1-to-1, reference recent articles)
3. **Agent #46** provides supporting materials (press release, fact sheet, product demo)
4. **Loop 2 Validation**:
   - Agent #54 validates pitch quality (personalization, relevance)
   - Agent #55 assesses likely response rate (based on historical data)
   - Consensus threshold: ≥0.85
5. **Agent #13 (Marketing Director)** approves pitch campaign
6. **Agent #47** sends pitches via MCP server `marketing-media-outreach`:
   - Day 1: Initial pitch to 50 journalists
   - Day 3: Follow-up #1 to non-responders (30-35 journalists expected)
   - Day 7: Follow-up #2 to non-responders (20-25 journalists expected)
7. **Agent #47** tracks responses, schedules interviews/demos
8. **Agent #48** monitors resulting coverage
9. **Agent #49** updates journalist CRM (response rates, coverage secured)

**Timeline**: 10 days (pitch creation → follow-ups → coverage monitoring)

**Success Criteria**:
- ✅ Response rate: ≥15% (7-8 journalists respond)
- ✅ Coverage secured: ≥10% (5 articles published)
- ✅ Tier 1 coverage: 1-2 articles

---

### Workflow 3: HARO Response (Opportunistic Coverage)

**Trigger**: Relevant HARO query detected (3x/day monitoring)

**Process**:
1. **Agent #50** monitors HARO queries 3x/day (9 AM, 1 PM, 5 PM)
2. **Agent #50** identifies relevant queries (AI, genealogy, family tech, consumer apps)
3. **Agent #50** drafts response (company data, executive quote, contact info)
4. **Fast-Track Validation** (time-sensitive, <2 hour deadline):
   - Agent #54 validates factual accuracy (skip AP Style review for speed)
   - Agent #56 reviews legal compliance (no unsubstantiated claims)
   - Consensus threshold: ≥0.80 (lower threshold due to time constraint)
5. **Agent #50** submits response within 2 hours of query
6. **Agent #48** monitors for coverage (journalist may or may not use response)
7. **Agent #50** tracks success rate (responses submitted vs coverage secured)

**Timeline**: 2 hours (query detection → response submission)

**Success Criteria**:
- ✅ Response time: <2 hours (90% of queries)
- ✅ Responses submitted: 2-5 per day
- ✅ Coverage secured: 1-2 per week (20% conversion rate)

---

### Workflow 4: Crisis Communications

**Trigger**: Negative viral post, product failure, misinformation, executive controversy

**Process**:
1. **Agent #48** detects crisis trigger (negative mentions spike, sentiment drops)
2. **Agent #51** assesses crisis severity (Low / Medium / High / Critical)
3. **If High or Critical**:
   - Agent #51 alerts Marketing Director immediately (Slack, SMS, phone)
   - Agent #51 drafts crisis response statement (within 30 minutes)
   - **Emergency Validation** (time-sensitive):
     - Agent #54 validates factual accuracy
     - Agent #56 reviews legal compliance (liability exposure)
     - Consensus threshold: ≥0.75 (lower threshold due to urgency)
   - Agent #13 (Marketing Director) approves statement (within 15 minutes)
   - Agent #51 distributes statement:
     - Post on social media (Twitter, LinkedIn)
     - Send to top 20 journalists (preempt negative coverage)
     - Update website FAQ (address concerns proactively)
   - Agent #51 monitors sentiment shift (target: 50% improvement within 4 hours)
4. **If Medium severity**:
   - Agent #51 coordinates with customer support (address customer concerns)
   - Agent #46 drafts proactive blog post (transparent, solution-focused)
   - Standard validation process (Agent #54, #55, #56)
5. **If Low severity**:
   - Agent #51 monitors (no immediate action needed)
   - Customer support handles individual responses

**Timeline**:
- Crisis detection: Real-time (within 15 minutes of viral spread)
- Crisis assessment: 15 minutes
- Response statement draft: 30 minutes
- Approval: 15 minutes
- **Total response time: 1 hour** (from detection to statement published)

**Success Criteria**:
- ✅ Response time: <2 hours (High/Critical crises)
- ✅ Sentiment improvement: ≥50% (negative → neutral or positive)
- ✅ Media containment: Zero Tier 1 negative articles (prevent mainstream media amplification)

---

### Workflow 5: Analyst Relations Briefing

**Trigger**: Quarterly product update, major product launch, analyst report submission

**Process**:
1. **Agent #53** schedules analyst briefing (with top 20 analysts)
2. **Agent #53** prepares briefing materials:
   - Product roadmap presentation (from product team)
   - Q4 metrics (customer count, revenue, user growth)
   - Competitive positioning (from Agent #38: Competitive Intelligence)
3. **Agent #46** drafts executive talking points (key messages, Q&A)
4. **Loop 2 Validation**:
   - Agent #54 validates messaging consistency
   - Agent #55 reviews competitive claims (factual, substantiated)
   - Agent #56 reviews financial disclosures (confidential data handling)
   - Consensus threshold: ≥0.90
5. **Agent #13 (Marketing Director)** approves briefing materials
6. **Agent #53** conducts analyst briefing (CEO or VP Product presents)
7. **Agent #53** follows up with analyst (additional data, customer references)
8. **Agent #53** tracks analyst mentions in reports (post-briefing coverage)

**Timeline**: 4 weeks (briefing prep → execution → follow-up → coverage monitoring)

**Success Criteria**:
- ✅ Analyst briefings completed: 5-10 per quarter
- ✅ Analyst report mentions: 2-3 per quarter
- ✅ Positive analyst sentiment: ≥80%

---

## MCP Servers Required

### 1. marketing-press-distribution

**Purpose**: Distribute press releases to 10,000+ media outlets via PR Newswire, Business Wire, PRWeb

**Platforms**: PR Newswire, Business Wire, PRWeb, Cision

**OAuth Scopes**:
- `press_releases.write` (create and distribute)
- `distribution.read` (track distribution metrics)

**Operations**:
- `distribute_press_release`: Send press release to wire services
- `schedule_distribution`: Schedule press release for future distribution
- `get_distribution_metrics`: Retrieve pickup rate, reach, impressions
- `update_press_release`: Edit press release before distribution
- `cancel_distribution`: Cancel scheduled distribution

**n8n Workflow Structure** (7 nodes):
```
[1] MCP Server Trigger
 ↓
[2] Route by Operation (distribute|schedule|get_metrics|update|cancel)
 ↓
[3] Validate Press Release (check required fields: headline, dateline, body, contact)
 ↓
[4] PR Newswire OAuth2 (scopes: press_releases.write)
 ↓
[5] PR Newswire API Request (create press release, distribute)
 ↓
[6] Error Handler (rate limit, invalid format, duplicate distribution)
 ↓
[7] Format Response (distribution_id, pickup_count, estimated_reach)
 ↓
[8] Respond to MCP Client
```

**Example Usage**:
```bash
# Agent #46 distributes press release
./.claude/skills/cfn-marketing-press-distribution/operations/distribute-press-release.sh \
  --headline "OurStories Reaches 100,000 Families Preserving Memories with AI-Powered Platform" \
  --dateline "SAN FRANCISCO, CA — October 28, 2025" \
  --body "$(cat /tmp/press-release-body.txt)" \
  --contact "press@ourstories.com" \
  --contact-phone "(555) 123-4567" \
  --distribution-targets "technology,genealogy,consumer_apps" \
  --embargo-until "2025-10-29T00:00:00Z"

# Returns:
# ✅ Press release distributed successfully
# Distribution ID: pr-abc123
# Outlets: 10,245 (PR Newswire) + 5,120 (Business Wire) = 15,365 total
# Estimated Reach: 25 million readers
# Pickup Tracking: https://app.prnewswire.com/distribution/pr-abc123
```

**Cost**: $500-1,000 per distribution (PR Newswire/Business Wire fees)

---

### 2. marketing-media-outreach

**Purpose**: Find journalists, send personalized pitches, track responses

**Platforms**: Muck Rack (journalist database), Hunter.io (email finder), Mailshake/Lemlist (cold outreach), HARO API

**OAuth Scopes**:
- `journalists.read` (search journalist database)
- `pitches.send` (send personalized pitches)
- `responses.read` (track open rates, responses)

**Operations**:
- `find_journalists`: Search journalist database by beat, publication, keywords
- `get_journalist_profile`: Retrieve journalist contact info, recent articles, social profiles
- `send_pitch`: Send personalized pitch email
- `track_pitch_response`: Check if pitch was opened, clicked, replied
- `schedule_follow_up`: Schedule automated follow-up (Day 3, Day 7)
- `get_haro_queries`: Fetch relevant HARO queries
- `submit_haro_response`: Submit response to HARO query

**n8n Workflow Structure** (9 nodes):
```
[1] MCP Server Trigger
 ↓
[2] Route by Operation (find_journalists|get_profile|send_pitch|track_response|get_haro|submit_haro)
 ↓
[3] If Node (operation == find_journalists)
  ├─ Yes → [4a] Muck Rack API (search by beat, publication, keywords)
  └─ No  → [4b] Skip to next operation
 ↓
[5] If Node (operation == send_pitch)
  ├─ Yes → [6a] Mailshake API (send personalized email with tracking)
  └─ No  → Skip
 ↓
[7] If Node (operation == get_haro_queries)
  ├─ Yes → [8a] HARO API (fetch queries matching keywords)
  └─ No  → Skip
 ↓
[9] Error Handler (invalid email, rate limit, journalist opted out)
 ↓
[10] Format Response (journalist_id, pitch_sent, open_rate, response_received)
 ↓
[11] Respond to MCP Client
```

**Example Usage (Find Journalists)**:
```bash
# Agent #47 finds journalists covering AI and genealogy
./.claude/skills/cfn-marketing-media-outreach/operations/find-journalists.sh \
  --beat "artificial intelligence,genealogy,consumer technology" \
  --publications "TechCrunch,Wired,Family Tree Magazine,AI Weekly" \
  --keywords "AI applications,family tech,photo restoration" \
  --min-followers 5000 \
  --limit 50

# Returns:
# ✅ Found 47 journalists matching criteria
#
# Top 10 Results:
# 1. Sarah Johnson - TechCrunch
#    - Beat: Consumer AI, Family Tech
#    - Email: sarah.johnson@techcrunch.com
#    - Twitter: @sarahtechwriter (25K followers)
#    - Recent Articles:
#      * "AI Apps Everyday Families Actually Use" (Oct 15, 2025)
#      * "The Quiet AI Revolution in Consumer Apps" (Sep 20, 2025)
#
# 2. Michael Chen - Wired
#    - Beat: AI Ethics, Consumer Technology
#    - Email: michael.chen@wired.com
#    - Twitter: @mchen_tech (18K followers)
#    - Recent Articles:
#      * "When AI Gets Personal: Family History Apps" (Oct 5, 2025)
#      * "AI for Good: Consumer Applications Making an Impact" (Sep 12, 2025)
```

**Example Usage (Send Pitch)**:
```bash
# Agent #47 sends personalized pitch
./.claude/skills/cfn-marketing-media-outreach/operations/send-pitch.sh \
  --journalist-id "sarah-johnson-techcrunch" \
  --subject "AI Brings Century-Old Family Photos Back to Life [Pitch]" \
  --body "$(cat /tmp/pitch-body.txt)" \
  --personalization '{
    "recent_article": "AI Apps Everyday Families Actually Use",
    "article_date": "October 15, 2025",
    "article_quote": "AI solving real family problems, not just enterprise use cases"
  }' \
  --follow-up-schedule "day3,day7" \
  --track-opens true

# Returns:
# ✅ Pitch sent successfully
# Pitch ID: pitch-xyz789
# To: sarah.johnson@techcrunch.com
# Subject: AI Brings Century-Old Family Photos Back to Life [Pitch]
# Tracking: Opens, clicks, replies enabled
# Follow-ups: Scheduled for Day 3 (Oct 31), Day 7 (Nov 4)
```

**Example Usage (HARO Queries)**:
```bash
# Agent #50 fetches HARO queries
./.claude/skills/cfn-marketing-media-outreach/operations/get-haro-queries.sh \
  --keywords "AI,genealogy,family tech,consumer apps,photo restoration" \
  --deadline-within "24 hours" \
  --exclude-categories "finance,real estate,automotive"

# Returns:
# ✅ Found 3 relevant HARO queries
#
# Query 1:
# Category: Technology / Consumer Apps
# Deadline: October 28, 2025, 5:00 PM EST (4 hours remaining)
# Query: "I'm writing an article about AI applications that everyday families
#         are using (not enterprise). Looking for examples of AI solving real
#         family problems, with data on adoption rates among non-tech-savvy
#         users (50+ years old demographic)."
# Contact: sarah.johnson@techcrunch.com
# Required: Company name, spokesperson, data points, executive quote
#
# Query 2:
# Category: Lifestyle / Family
# Deadline: October 29, 2025, 12:00 PM EST (23 hours remaining)
# Query: "Looking for experts on preserving family history for multi-generational
#         storytelling. Interested in digital tools that help grandparents and
#         grandchildren connect."
# Contact: emily.rodriguez@familytreemagazine.com
# Required: Expert quote, case studies, product recommendations
```

**Cost**: $200-400/month (Muck Rack subscription, Hunter.io API, Mailshake)

---

### 3. marketing-media-monitoring

**Purpose**: Monitor brand mentions, competitor coverage, industry news across 50,000+ sources in real-time

**Platforms**: Meltwater, Brandwatch, Mention, Google News API, NewsAPI.org, Social Mention, Brand24

**OAuth Scopes**:
- `mentions.read` (real-time brand monitoring)
- `sentiment.analyze` (sentiment analysis)
- `competitors.monitor` (competitor coverage tracking)

**Operations**:
- `get_brand_mentions`: Fetch brand mentions (news, blogs, social, podcasts)
- `analyze_sentiment`: Analyze sentiment (positive, neutral, negative)
- `get_share_of_voice`: Calculate share of voice vs competitors
- `get_trending_stories`: Identify trending stories in industry
- `set_crisis_alert`: Configure crisis alerts (negative mentions spike, sentiment drops)
- `get_competitor_coverage`: Track competitor media coverage

**n8n Workflow Structure** (8 nodes):
```
[1] MCP Server Trigger
 ↓
[2] Route by Operation (get_mentions|analyze_sentiment|share_of_voice|trending|alerts|competitor)
 ↓
[3] Route by Platform (meltwater|brandwatch|mention|google_news|newsapi)
 ↓
[4] Platform OAuth2 (scopes: mentions.read, sentiment.analyze)
 ↓
[5] Platform API Request (fetch mentions, analyze sentiment)
 ↓
[6] If Node (operation == analyze_sentiment)
  ├─ Yes → [7a] Sentiment Analysis (NLP model, classify positive/neutral/negative)
  └─ No  → Skip
 ↓
[8] Filter Results (date range, sentiment threshold, source tier)
 ↓
[9] Transform Data (normalize to standard schema)
 ↓
[10] If Node (crisis detected: negative mentions > threshold)
  ├─ Yes → [11a] Send Crisis Alert (Slack webhook, SMS, email to Agent #51)
  └─ No  → Skip
 ↓
[12] Format Response (mentions[], sentiment_score, share_of_voice, crisis_detected)
 ↓
[13] Respond to MCP Client
```

**Example Usage (Brand Mentions)**:
```bash
# Agent #48 monitors brand mentions (real-time)
./.claude/skills/cfn-marketing-media-monitoring/operations/get-brand-mentions.sh \
  --keywords "OurStories,family history AI,photo restoration app" \
  --sources "news,blogs,social,podcasts" \
  --date-range "last_24_hours" \
  --sentiment "all" \
  --min-reach 1000 \
  --sort "reach_desc"

# Returns:
# ✅ Found 18 brand mentions (last 24 hours)
#
# Mention 1:
# Source: TechCrunch (Tier 1)
# Title: "OurStories Hits 100K Users, AI Photo Restoration Trend Accelerates"
# URL: https://techcrunch.com/2025/10/28/ourstories-100k-users
# Published: October 28, 2025, 9:15 AM
# Author: Sarah Johnson
# Reach: 2.5 million readers
# Sentiment: Positive (confidence: 0.92)
# Key Mentions: "AI-powered photo restoration", "100,000 families", "82% of users are 50+"
# Social Shares: 1,200 (Twitter: 850, LinkedIn: 250, Facebook: 100)
#
# Mention 2:
# Source: Reddit r/Genealogy (Tier 3)
# Title: "OurStories pricing confusion - is it free or paid?"
# URL: https://reddit.com/r/Genealogy/comments/abc123
# Published: October 28, 2025, 2:30 PM
# Reach: 850,000 subreddit members
# Sentiment: Negative (confidence: 0.78)
# Comments: 45 (mixed sentiment, pricing confusion)
# ⚠️ Crisis Alert: Low severity (isolated negative post, not viral)
```

**Example Usage (Crisis Alert)**:
```bash
# Agent #48 configures crisis alert
./.claude/skills/cfn-marketing-media-monitoring/operations/set-crisis-alert.sh \
  --keywords "OurStories" \
  --trigger-conditions '{
    "negative_mentions_spike": 10,  // 10+ negative mentions in 1 hour
    "sentiment_drop": 0.3,            // Sentiment drops by 30 percentage points
    "viral_threshold": 1000,          // Post reaches 1,000+ upvotes/shares
    "tier1_negative": 1                // Any Tier 1 publication negative article
  }' \
  --alert-channels "slack,sms,email" \
  --notify "agent-51,marketing-director"

# Returns:
# ✅ Crisis alert configured
# Monitoring: Real-time (checks every 5 minutes)
# Trigger Conditions: 4 conditions configured
# Alert Channels: Slack (#crisis-alerts), SMS (+1-555-123-4567), Email (crisis@company.com)
# Notified Agents: Agent #51 (Crisis Comms), Marketing Director
```

**Cost**: $400-800/month (Meltwater or Brandwatch subscription)

---

## Database Schema Extensions

### PR-Specific Tables

```sql
-- Press releases
CREATE TABLE press_releases (
    release_id VARCHAR(50) PRIMARY KEY,
    headline VARCHAR(255) NOT NULL,
    dateline VARCHAR(100),  -- "SAN FRANCISCO, CA — October 28, 2025"
    body TEXT NOT NULL,
    boilerplate TEXT,  -- Standard company description
    media_contact_name VARCHAR(100),
    media_contact_email VARCHAR(100),
    media_contact_phone VARCHAR(20),
    distribution_status VARCHAR(20) DEFAULT 'draft',  -- draft|scheduled|distributed
    distribution_date TIMESTAMP,
    distribution_id VARCHAR(100),  -- PR Newswire tracking ID
    estimated_reach INTEGER,
    actual_pickup_count INTEGER,
    loop3_confidence DECIMAL(3,2),
    loop2_consensus DECIMAL(3,2),
    approved_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Journalists database
CREATE TABLE journalists (
    journalist_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    publication VARCHAR(100),
    beat VARCHAR(255),  -- "Consumer AI, Family Tech"
    twitter_handle VARCHAR(50),
    twitter_followers INTEGER,
    linkedin_url VARCHAR(255),
    relationship_score INTEGER DEFAULT 0,  -- 0-100
    last_contact_date DATE,
    pitch_acceptance_rate DECIMAL(5,2),  -- 0.38 = 38%
    preferences TEXT,  -- JSON: {"embargo_policy": "48 hours", "pitch_style": "data-driven"}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media pitches
CREATE TABLE media_pitches (
    pitch_id VARCHAR(50) PRIMARY KEY,
    journalist_id VARCHAR(50),
    press_release_id VARCHAR(50),
    subject_line VARCHAR(255),
    pitch_body TEXT,
    personalization_data TEXT,  -- JSON: {"recent_article": "...", "article_quote": "..."}
    sent_date TIMESTAMP,
    opened BOOLEAN DEFAULT false,
    open_date TIMESTAMP,
    clicked BOOLEAN DEFAULT false,
    click_date TIMESTAMP,
    replied BOOLEAN DEFAULT false,
    reply_date TIMESTAMP,
    reply_text TEXT,
    follow_up_count INTEGER DEFAULT 0,
    coverage_secured BOOLEAN DEFAULT false,
    coverage_url VARCHAR(255),
    FOREIGN KEY (journalist_id) REFERENCES journalists(journalist_id),
    FOREIGN KEY (press_release_id) REFERENCES press_releases(release_id)
);

-- Media coverage
CREATE TABLE media_coverage (
    coverage_id VARCHAR(50) PRIMARY KEY,
    press_release_id VARCHAR(50),
    pitch_id VARCHAR(50),
    publication VARCHAR(100),
    publication_tier VARCHAR(10),  -- tier1|tier2|tier3
    article_title VARCHAR(255),
    article_url VARCHAR(500),
    author VARCHAR(100),
    publish_date TIMESTAMP,
    estimated_reach INTEGER,
    sentiment VARCHAR(20),  -- positive|neutral|negative
    sentiment_confidence DECIMAL(3,2),
    key_messages_mentioned TEXT,  -- JSON array: ["AI-powered", "100,000 families"]
    social_shares INTEGER,
    backlinks INTEGER,
    ave DECIMAL(10,2),  -- Advertising Value Equivalency
    FOREIGN KEY (press_release_id) REFERENCES press_releases(release_id),
    FOREIGN KEY (pitch_id) REFERENCES media_pitches(pitch_id)
);

-- Brand mentions (media monitoring)
CREATE TABLE brand_mentions (
    mention_id VARCHAR(50) PRIMARY KEY,
    source VARCHAR(100),  -- "TechCrunch", "Reddit r/Genealogy"
    source_type VARCHAR(20),  -- news|blog|social|podcast|video
    source_tier VARCHAR(10),  -- tier1|tier2|tier3
    title VARCHAR(255),
    url VARCHAR(500),
    author VARCHAR(100),
    publish_date TIMESTAMP,
    estimated_reach INTEGER,
    sentiment VARCHAR(20),  -- positive|neutral|negative
    sentiment_confidence DECIMAL(3,2),
    keywords_mentioned TEXT,  -- JSON array
    social_shares INTEGER,
    comments_count INTEGER,
    crisis_flag BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HARO queries and responses
CREATE TABLE haro_queries (
    query_id VARCHAR(50) PRIMARY KEY,
    category VARCHAR(100),  -- "Technology / Consumer Apps"
    query_text TEXT,
    deadline TIMESTAMP,
    journalist_email VARCHAR(100),
    requirements TEXT,
    response_submitted BOOLEAN DEFAULT false,
    response_text TEXT,
    response_submitted_date TIMESTAMP,
    coverage_secured BOOLEAN DEFAULT false,
    coverage_url VARCHAR(255)
);

-- Crisis events
CREATE TABLE crisis_events (
    crisis_id VARCHAR(50) PRIMARY KEY,
    trigger_type VARCHAR(50),  -- negative_viral_post|product_failure|misinformation|controversy
    severity VARCHAR(20),  -- low|medium|high|critical
    detected_date TIMESTAMP,
    description TEXT,
    initial_mention_count INTEGER,
    initial_sentiment_score DECIMAL(3,2),
    response_statement TEXT,
    response_published_date TIMESTAMP,
    resolution_date TIMESTAMP,
    post_crisis_sentiment DECIMAL(3,2),
    lessons_learned TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Industry analysts
CREATE TABLE industry_analysts (
    analyst_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    firm VARCHAR(100),  -- "Gartner", "Forrester", "IDC"
    title VARCHAR(100),  -- "VP Analyst", "Principal Analyst"
    coverage_areas TEXT,  -- JSON array: ["AI", "Consumer Apps", "Genealogy"]
    email VARCHAR(100),
    phone VARCHAR(20),
    linkedin_url VARCHAR(255),
    relationship_score INTEGER DEFAULT 0,  -- 0-100
    last_briefing_date DATE,
    briefing_frequency VARCHAR(20),  -- quarterly|biannual|annual
    reports_covered_us INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analyst briefings
CREATE TABLE analyst_briefings (
    briefing_id VARCHAR(50) PRIMARY KEY,
    analyst_id VARCHAR(50),
    briefing_date TIMESTAMP,
    briefing_type VARCHAR(50),  -- product_update|strategy_session|report_submission
    topics_covered TEXT,  -- JSON array
    materials_shared TEXT,  -- JSON array of file URLs
    follow_up_items TEXT,  -- JSON array
    analyst_feedback TEXT,
    coverage_resulted BOOLEAN DEFAULT false,
    coverage_report_name VARCHAR(255),
    FOREIGN KEY (analyst_id) REFERENCES industry_analysts(analyst_id)
);
```

---

## Integration with Existing Marketing Agents

### Content Repurposing Pipeline

**Blog Post → Press Release**:
- Agent #1 (SEO Content Writer) writes blog post about new feature
- Agent #46 (Press Release Writer) transforms blog post into press release
- Agent #47 (Media Pitch Specialist) pitches to journalists with exclusive angle

**Video Content → Media Asset**:
- Agent #16 (Video Prompt Engineer) creates video about customer success story
- Agent #52 (Press Kit Manager) adds video to press kit
- Agent #47 pitches video story to lifestyle journalists

**Social Media → Crisis Monitoring**:
- Agent #2 (Social Media Manager) publishes post
- Agent #48 (Media Monitoring) tracks mentions and sentiment
- Agent #51 (Crisis Comms) alerts if negative backlash detected

---

## Budget & Timeline

### Phase 5: PR & Media Relations (6 weeks)

**Development**:
- Backend developer: 0.5 FTE × 6 weeks × $2,000/week = $6,000
- QA engineer: 0.25 FTE × 6 weeks × $2,000/week = $3,000
- PR consultant: 0.5 FTE × 6 weeks × $2,000/week = $6,000 (train agents on AP Style, media relations best practices)
- Legal review: 0.25 FTE × 2 weeks × $2,000/week = $1,000 (legal compliance validation)
- Contingency (20%): $3,200

**Total Development**: $19,200

**Infrastructure** (ongoing):
- PR Newswire/Business Wire: $500-1,000 per distribution (10 distributions/year = $5,000-10,000/year)
- Muck Rack subscription: $200/month
- Meltwater/Brandwatch: $400/month
- Mailshake/Lemlist: $100/month
- HARO API: $0 (free tier sufficient)

**Total Monthly Infrastructure**: $700/month

**Total Phase 5 Budget**: $22,000 (one-time) + $700/month (ongoing)

---

## ROI Projection

### Expected Media Coverage (Year 1)

**Press Releases**: 12 per year (1 per month)
- Tier 1 coverage: 18 articles (1.5 per release)
- Tier 2 coverage: 48 articles (4 per release)
- Tier 3 coverage: 60 articles (5 per release)
- **Total**: 126 articles/year

**Media Pitches**: 600 pitches per year (50 per month)
- Response rate: 15% = 90 responses
- Coverage secured: 10% = 60 articles
- **Total**: 60 additional articles/year

**HARO Responses**: 120 responses per year (10 per month)
- Coverage secured: 20% = 24 articles
- **Total**: 24 additional articles/year

**Grand Total**: 210 articles/year

### Advertising Value Equivalency (AVE)

- Tier 1 article AVE: $50,000 (full-page ad equivalent)
- Tier 2 article AVE: $10,000
- Tier 3 article AVE: $2,000

**Total AVE (Year 1)**:
- Tier 1: 18 articles × $50,000 = $900,000
- Tier 2: 48 articles × $10,000 = $480,000
- Tier 3: 144 articles × $2,000 = $288,000
- **Total AVE**: $1,668,000

**Investment (Year 1)**: $22,000 + ($700 × 12) = $30,400

**ROI**: 5,485% (every $1 spent generates $54.85 in ad value)

---

## Next Steps

1. **Review PR team design** (agents, workflows, MCP servers)
2. **Approve budget** ($22K development + $700/month infrastructure)
3. **Begin Phase 5 development** (6 weeks)
4. **Integrate with existing marketing agents** (content repurposing pipeline)
5. **Launch PR program** (first press release distribution)

**Confidence**: 0.94
**Business Impact**: Critical (media coverage drives brand awareness, credibility, inbound leads)
