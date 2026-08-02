import type {
  CreateLocationInput,
  DeleteLocationInput,
  UpdateLocationInput
} from '../generated/inputs';
import type { Location } from '../generated/objects';
import type { LocationQueryArgs, LocationsQueryArgs } from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions
} from './base/Resource';
import { LOCATION } from './base/selections';

/** Bins and other storage locations within a warehouse. */
export default class Locations extends BaseResource {
  get(args: LocationQueryArgs, options: GetOptions = {}): Promise<Location | null> {
    return this.fetchObject<Location>('location', args, LOCATION, options);
  }

  page(args: LocationsQueryArgs = {}, options: PageOptions = {}): Promise<Page<Location>> {
    return this.fetchPage<Location>('locations', args, LOCATION, options);
  }

  listAll(args: LocationsQueryArgs = {}, options: ListAllOptions = {}): Promise<Location[]> {
    return this.collect<Location>('locations', args, LOCATION, options);
  }

  create(data: CreateLocationInput, options: MutateOptions = {}): Promise<Location> {
    return this.runMutation<Location>(
      'location_create',
      { data },
      options.selection ?? LOCATION,
      options
    );
  }

  update(data: UpdateLocationInput, options: MutateOptions = {}): Promise<Location> {
    return this.runMutation<Location>(
      'location_update',
      { data },
      options.selection ?? LOCATION,
      options
    );
  }

  delete(data: DeleteLocationInput): Promise<unknown> {
    return this.runMutation('location_delete', { data }, '');
  }
}
