import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPlaceholderListing } from '../skills/job-acquisition/placeholder-filter.mjs';

describe('isPlaceholderListing (Fix 3)', () => {
  const knownPlaceholders = [
    'How Apply',
    'Oops something happened',
    'Open Vacancies',
    'Our vacancies',
    'THINK WE COULD BE A GOOD FIT',
    'CHECK BACK SOON',
    'CANDIDATURE SPONTANÃE',
    'Test',
    'Join Our Team',
    'JOIN THE Family',
    'Various \n@ Luigi’s Box', // real observed RemoteOK title shape
    'Multiple Positions',
    'A glimpse of the pool',
    'Spontaneous Application Halifax',
  ];

  for (const title of knownPlaceholders) {
    test(`rejects known placeholder title: "${title.split('\n')[0]}"`, () => {
      assert.equal(isPlaceholderListing({ title }), true);
    });
  }

  test('does NOT reject a real listing whose title merely contains a trigger word (precision, per audit finding)', () => {
    // The exact false-positive risk the audit flagged: a substring check on
    // "various"/"multiple" would incorrectly eat a real listing like this.
    assert.equal(isPlaceholderListing({ title: 'Multiple AI Operations Intern openings' }), false);
    assert.equal(isPlaceholderListing({ title: 'Various Backend Engineering Roles at Acme (apply now)' }), false);
  });

  test('does NOT reject genuinely distinctive real-looking titles', () => {
    assert.equal(isPlaceholderListing({ title: 'AI Operations Intern' }), false);
    assert.equal(isPlaceholderListing({ title: 'CR281 Customs Agent' }), false);
    assert.equal(isPlaceholderListing({ title: 'Senior Software Engineer, Platform' }), false);
  });

  test('handles missing/empty title without throwing', () => {
    assert.equal(isPlaceholderListing({}), false);
    assert.equal(isPlaceholderListing({ title: '' }), false);
  });
});
