# LinkedIn Summary

I built Digital Command Center to solve a problem I ran into directly: searching for internship-level roles across multiple job boards is noisy, repetitive, and easy to lose track of. Most listings don't match a specific profile at all, and there's no memory across sessions — you re-evaluate the same postings, manually, every time.

**The engineering approach:** rather than pointing an LLM at a pile of job listings and asking it to "find good matches," I split the problem in two. A deterministic engine handles everything that needs to be reproducible and safe — eligibility rules, deduplication, a weighted scoring formula, and a fixed quality threshold. A Claude-based reasoning layer sits alongside it, strictly advisory — it can explain *why* a listing might be a good semantic fit, but it can never change which listing gets selected. That split is enforced in code, not just policy: the scoring decision happens before the AI evaluation is ever consulted.

**The AI architecture** is provider-agnostic by design — the reasoning layer sits behind a small interface, so the concrete provider (currently Claude, via the real Messages API with structured JSON output) can be swapped without touching the rest of the system. I built it with the constraints a real, repeatedly-run agent needs: bounded retries, capped API calls per run, minimal per-request context (only the relevant job + relevant profile fields, never the whole history), and a hard rule that the system never fabricates a successful AI response — if no credential is configured, it falls back transparently and says so.

**Automation, honestly scoped:** the system discovers opportunities from live public APIs, filters and scores them deterministically, tracks everything it's ever seen so nothing gets re-processed, and drafts application content — but it stops there. Every draft is marked pending human approval; nothing is ever submitted or sent automatically. That boundary isn't a settings toggle, it's the absence of any code path that could do otherwise.

**Measurable validation:** I ran it against real data — three live job-board APIs, 229 real listings evaluated over multiple sessions. 217 were correctly rejected by the deterministic filters, 12 survived to scoring, and the highest score reached was 76 out of a 100-point scale against an 85-point selection bar. Zero were selected. I reported that honestly rather than lowering the bar to produce a more impressive number — which, to me, is the actual point of building something with a deterministic core: I can trust the zero.

**What I learned:** the hardest part of "AI agent" projects isn't wiring up an API call — it's deciding, concretely and in code, what the model is and isn't allowed to influence, and building the discipline to report a system's real status (connected, not connected, tested, not tested) rather than the status that would look best in a demo.

#SoftwareEngineering #AIAgents #Claude #NodeJS #SystemDesign
