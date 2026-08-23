/**
 * Organizations — the company record, and usually the customer of record in a B2B sync.
 *
 * Pipedrive does not enforce unique organization names, so name matching is inherently
 * ambiguous. `findAllByName` returns every exact match so a caller can decide; there is
 * deliberately no "find one by name" that hides the ambiguity, because silently merging two
 * customers is far more expensive than surfacing the duplicate.
 */

import { PipedriveResource } from './base';
import type { PipedriveHttpClient } from '../client/http-client';
import type {
  PipedriveOrganization,
  PipedriveOrganizationInput,
  PipedriveOrganizationListOptions,
} from '../types/organizations';

interface SearchItem<T> {
  item: T;
}

export class PipedriveOrganizations extends PipedriveResource<
  PipedriveOrganization,
  PipedriveOrganizationInput,
  PipedriveOrganizationListOptions
> {
  constructor(http: PipedriveHttpClient) {
    super(http, 'organizations', 'Organization');
  }

  /**
   * Every organization whose name matches exactly, case-insensitively.
   *
   * The local re-check is the point: Pipedrive's search is fuzzy, so "Agrisea" also returns
   * "Agrisea Holdings" and "Agrisea NZ Ltd". Taking the first row back attaches orders to
   * whichever the search ranked highest that day.
   */
  async findAllByName(name: string): Promise<PipedriveOrganization[]> {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return [];

    const result = await this.http.get<{ items?: Array<SearchItem<PipedriveOrganization>> }>(
      'organizations/search',
      { term: wanted, fields: 'name', exact_match: true, limit: 100 },
      this.context('findOrganizationByName', wanted)
    );

    return (result.items ?? [])
      .map((entry) => entry.item)
      .filter((org) => org.name?.trim().toLowerCase() === wanted);
  }
}
