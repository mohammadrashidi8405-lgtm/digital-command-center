const WEIGHTS = {
  roleMatch: 25,
  skillMatch: 20,
  eligibility: 20,
  teamLearningValue: 15,
  remoteCompatibility: 10,
  compensation: 5,
  applicationFriction: 5,
};

const BONUS_MARKERS = {
  aiStartupAlignment: [/\bai[- ]first\b/i, /\bstartup\b/i, /\bseed\b/i, /\bseries [ab]\b/i, /\bfast[- ]paced\b/i],
  portfolioRelevance: [/\bautomation\b/i, /\bno[- ]code\b/i, /\bn8n\b/i, /\bworkflow\b/i, /\bdashboard\b/i, /\bcrm\b/i],
  teamEnvironment: [/\bsmall team\b/i, /\bcollaborate\b/i, /\bcross[- ]functional\b/i, /\bmentorship\b/i],
  founderAccessible: [/\bfounder\b/i, /\breport(s|ing)? to (the )?(founder|ceo)\b/i, /\bdirectly with (the )?founder\b/i],
};

const PENALTY_MARKERS = {
  majorSkillMismatch: [/\b\d+\+ years of (software|engineering)\b/i, /\bcs degree required\b/i, /\bphd required\b/i],
  unclearLegitimacy: [/\bno company website\b/i],
};

function countMatches(text, patterns) {
  return patterns.filter((re) => re.test(text)).length;
}

function textOf(job) {
  return `${job.title || ''} ${job.description || ''}`.toLowerCase();
}

function scoreRoleMatch(job, profile) {
  const text = textOf(job);
  const primary = profile.targetRoles?.primary || [];
  const secondary = profile.targetRoles?.secondary || [];
  const hitsPrimary = primary.some((r) => text.includes(r.toLowerCase().split(' ').slice(0, 2).join(' ')));
  const hitsSecondary = secondary.some((r) => text.includes(r.toLowerCase().split(' ').slice(0, 2).join(' ')));
  if (hitsPrimary) return WEIGHTS.roleMatch;
  if (hitsSecondary) return Math.round(WEIGHTS.roleMatch * 0.7);
  return Math.round(WEIGHTS.roleMatch * 0.3);
}

function scoreSkillMatch(job, profile) {
  const text = textOf(job);
  const skills = [...(profile.skills?.aiAssisted || []), ...(profile.skills?.tools || [])].map((s) => s.toLowerCase());
  const hits = skills.filter((s) => text.includes(s.toLowerCase())).length;
  const ratio = skills.length ? Math.min(1, hits / 4) : 0.3;
  return Math.round(WEIGHTS.skillMatch * (0.4 + 0.6 * ratio));
}

function scoreEligibility(job, profile) {
  let score = WEIGHTS.eligibility;
  const text = textOf(job);
  if (/work authorization|must be authorized to work/i.test(text)) score -= 4;
  if (/visa sponsorship not (available|provided)/i.test(text)) score -= 4;
  return Math.max(0, score);
}

function scoreTeamLearningValue(job) {
  const text = textOf(job);
  const signals = countMatches(text, [/mentor/i, /learn/i, /growth/i, /small team/i, /hands[- ]on/i]);
  return Math.min(WEIGHTS.teamLearningValue, Math.round((signals / 3) * WEIGHTS.teamLearningValue));
}

function scoreRemoteCompatibility(job) {
  if (job.remote === true) return WEIGHTS.remoteCompatibility;
  if (job.remote === false) return 0;
  return Math.round(WEIGHTS.remoteCompatibility * 0.5); // unknown
}

function scoreCompensation(job) {
  const text = textOf(job);
  if (/unpaid/i.test(text)) return 0;
  if (/\$|€|£|stipend|salary|hourly|per month|paid internship/i.test(text)) return WEIGHTS.compensation;
  return Math.round(WEIGHTS.compensation * 0.5); // unstated
}

function scoreApplicationFriction(job) {
  if (job.url) return WEIGHTS.applicationFriction;
  return Math.round(WEIGHTS.applicationFriction * 0.5);
}

/**
 * §19 scoring. Returns { total, breakdown, bonuses, penalties } — total is
 * clamped to [0, 100]. All sub-scores are deterministic heuristics over
 * listing text and the candidate profile; nothing here calls the Brain, so
 * scoring works identically with or without a live LLM provider.
 */
export function scoreJob(job, profile) {
  const text = textOf(job);
  const breakdown = {
    roleMatch: scoreRoleMatch(job, profile),
    skillMatch: scoreSkillMatch(job, profile),
    eligibility: scoreEligibility(job, profile),
    teamLearningValue: scoreTeamLearningValue(job),
    remoteCompatibility: scoreRemoteCompatibility(job),
    compensation: scoreCompensation(job),
    applicationFriction: scoreApplicationFriction(job),
  };
  const base = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const bonuses = [];
  if (countMatches(text, BONUS_MARKERS.aiStartupAlignment) > 0) bonuses.push(['strong AI/startup alignment', 5]);
  if (countMatches(text, BONUS_MARKERS.portfolioRelevance) > 0) bonuses.push(['strong portfolio relevance', 5]);
  if (countMatches(text, BONUS_MARKERS.teamEnvironment) > 0) bonuses.push(['evidence of genuine team environment', 5]);
  if (countMatches(text, BONUS_MARKERS.founderAccessible) > 0) bonuses.push(['founder/hiring-manager accessibility', 5]);

  const penalties = [];
  if (countMatches(text, PENALTY_MARKERS.majorSkillMismatch) > 0) penalties.push(['major skill mismatch', -10]);
  if (countMatches(text, PENALTY_MARKERS.unclearLegitimacy) > 0) penalties.push(['unclear employer legitimacy', -15]);

  const adjustment = [...bonuses, ...penalties].reduce((sum, [, v]) => sum + v, 0);
  const total = Math.max(0, Math.min(100, base + adjustment));

  return { total, breakdown, bonuses, penalties };
}

export const SCORE_WEIGHTS = WEIGHTS;
