/**
 * §22 job lifecycle states. Single source of truth — nothing else in this
 * skill should hardcode a status string.
 */
export const JobState = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  SCREENED: 'SCREENED',
  QUALIFIED: 'QUALIFIED',
  SELECTED: 'SELECTED',
  APPLICATION_READY: 'APPLICATION_READY',
  APPLIED: 'APPLIED',
  CONTACTED: 'CONTACTED',
  FOLLOW_UP: 'FOLLOW_UP',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
});

export function isValidState(state) {
  return Object.values(JobState).includes(state);
}

/**
 * §14 confidence tiers for opportunities, distinct from JobState.
 */
export const ConfidenceTier = Object.freeze({
  CONFIRMED_JOB: 'CONFIRMED_JOB',
  POTENTIAL_UPCOMING_OPPORTUNITY: 'POTENTIAL_UPCOMING_OPPORTUNITY',
  UNVERIFIED_SIGNAL: 'UNVERIFIED_SIGNAL',
});
