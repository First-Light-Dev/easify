/**
 * Persons — individual contacts, optionally attached to an organization.
 *
 * Matching a person by email is the common need, and `findByEmail` uses `/persons/search`
 * rather than a filter because Pipedrive offers no email filter on the list endpoint. Note
 * the cost: a search is about 40 tokens against the daily budget where a list read is 20, so
 * a per-record matching loop is the most expensive thing an integration can do here. Where
 * an external id can be stored in a custom field instead, prefer that.
 */

import { PipedriveResource } from './base';
import type { PipedriveHttpClient } from '../client/http-client';
import { primaryValue } from '../types/common';
import type {
  PipedrivePerson,
  PipedrivePersonInput,
  PipedrivePersonListOptions,
} from '../types/persons';

interface SearchItem<T> {
  item: T;
}

export class PipedrivePersons extends PipedriveResource<
  PipedrivePerson,
  PipedrivePersonInput,
  PipedrivePersonListOptions
> {
  constructor(http: PipedriveHttpClient) {
    super(http, 'persons', 'Person');
  }

  /**
   * The person whose primary email matches exactly, or null.
   *
   * Pipedrive's search is fuzzy and prefix-based even with `exact_match`, so the result is
   * re-checked locally: a search for `sam@farm.co` will happily return `sam@farm.co.nz`, and
   * attaching an order to that person puts one customer's sale on another's account.
   *
   * Returns the first exact match. Pipedrive does not enforce unique emails, so callers that
   * must not guess should use `findAllByEmail` and handle the duplicate.
   */
  async findByEmail(email: string): Promise<PipedrivePerson | null> {
    const matches = await this.findAllByEmail(email);
    return matches[0] ?? null;
  }

  /** Every person whose primary email matches exactly — for duplicate detection. */
  async findAllByEmail(email: string): Promise<PipedrivePerson[]> {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return [];

    const result = await this.http.get<{ items?: Array<SearchItem<PipedrivePerson>> }>(
      'persons/search',
      { term: wanted, fields: 'email', exact_match: true, limit: 100 },
      this.context('findPersonByEmail', wanted)
    );

    return (result.items ?? [])
      .map((entry) => entry.item)
      .filter((person) => {
        const primary = primaryValue(person.emails)?.trim().toLowerCase();
        if (primary === wanted) return true;
        // Fall back to any address on the record: the match may be on a secondary email,
        // which is still the same human.
        return (person.emails ?? []).some(
          (entry) => entry.value?.trim().toLowerCase() === wanted
        );
      });
  }

  /** Every person attached to an organization. */
  async byOrganization(orgId: number, options: Partial<PipedrivePersonListOptions> = {}) {
    return this.listAll({ ...options, org_id: orgId } as PipedrivePersonListOptions);
  }
}
