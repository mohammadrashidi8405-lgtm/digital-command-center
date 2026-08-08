import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTBOX_DIR = join(ROOT, 'skills', 'job-acquisition', 'outbox');

/**
 * §24: prepare applications autonomously, but never fabricate personal facts
 * and never submit anything. This writes a Markdown draft to
 * outbox/<key>-application.md with status PENDING_HUMAN_APPROVAL. There is
 * no send/submit path anywhere in this codebase — that is intentional, not
 * a missing feature.
 */
export function prepareApplicationDraft(job, profile) {
  if (!existsSync(OUTBOX_DIR)) mkdirSync(OUTBOX_DIR, { recursive: true });

  const projects = (profile.projects || [])
    .map((p) => `- **${p.name}** (${p.role}): ${p.summary}`)
    .join('\n');
  const skills = [...(profile.skills?.aiAssisted || []), ...(profile.skills?.tools || [])].join(', ');

  const content = `---
status: PENDING_HUMAN_APPROVAL
job: "${job.title}"
company: "${job.company || '[HUMAN INPUT REQUIRED: company name unclear]'}"
url: "${job.url || ''}"
generatedAt: "${new Date().toISOString()}"
---

# Draft application — ${job.title} at ${job.company || '(company unclear)'}

**This is a draft only. Nothing has been submitted. A human must review and
send this manually.**

## Why this role
Matches candidate target roles and skill set. See job-acquisition score
breakdown in memory/state for details.

## Relevant background
${profile.education?.map((e) => `- ${e.degree}, ${e.institution} (${e.status})`).join('\n') || ''}

Languages: ${profile.languages?.map((l) => `${l.language} (${l.level})`).join(', ') || ''}

Skills (AI-assisted; not represented as independent senior engineering
experience): ${skills}

## Relevant projects
${projects}

## Fields requiring human confirmation before sending
- [ ] Work authorization / eligibility declaration — [HUMAN INPUT REQUIRED]
- [ ] Salary expectations, if asked — [HUMAN INPUT REQUIRED]
- [ ] Nationality / visa status, if asked — [HUMAN INPUT REQUIRED]
- [ ] Any legal declaration or signature — [HUMAN INPUT REQUIRED]
- [ ] Final proofread and tone check

## Listing reference
${job.url || 'No URL available — sourced from: ' + job.source}
`;

  const path = join(OUTBOX_DIR, `${job.key}-application.md`);
  writeFileSync(path, content, 'utf8');
  return path;
}
