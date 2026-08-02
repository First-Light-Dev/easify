import type {
  CreateReturnExchangeInput,
  CreateReturnInput,
  ReceiveReturnLineItemInput,
  UpdateReturnStatusInput
} from '../generated/inputs';
import type { Return, ReturnExchange } from '../generated/objects';
import type { ReturnQueryArgs, ReturnsQueryArgs } from '../generated/operations';

import {
  BaseResource,
  GetOptions,
  ListAllOptions,
  MutateOptions,
  Page,
  PageOptions,
  toISO
} from './base/Resource';
import { RETURN } from './base/selections';

/**
 * Customer returns, including how much of each line the warehouse restocked.
 *
 * ```ts
 * const returns = await shiphero.returns.updatedSince(lastRun);
 * ```
 */
export default class Returns extends BaseResource {
  get(args: ReturnQueryArgs, options: GetOptions = {}): Promise<Return | null> {
    return this.fetchObject<Return>('return', args, RETURN, options);
  }

  page(args: ReturnsQueryArgs = {}, options: PageOptions = {}): Promise<Page<Return>> {
    return this.fetchPage<Return>('returns', args, RETURN, options);
  }

  pages(args: ReturnsQueryArgs = {}, options: ListAllOptions = {}) {
    return this.iteratePages<Return>('returns', args, RETURN, options);
  }

  listAll(args: ReturnsQueryArgs = {}, options: ListAllOptions = {}): Promise<Return[]> {
    return this.collect<Return>('returns', args, RETURN, options);
  }

  updatedSince(
    since: Date | string,
    args: ReturnsQueryArgs = {},
    options: ListAllOptions = {}
  ): Promise<Return[]> {
    return this.listAll({ ...args, updated_from: toISO(since) }, options);
  }

  forOrder(orderId: string, options: ListAllOptions = {}): Promise<Return[]> {
    return this.listAll({ order_id: orderId }, options);
  }

  create(data: CreateReturnInput, options: MutateOptions = {}): Promise<Return> {
    return this.runMutation<Return>(
      'return_create',
      { data },
      options.selection ?? RETURN,
      options
    );
  }

  updateStatus(data: UpdateReturnStatusInput, options: MutateOptions = {}): Promise<Return> {
    return this.runMutation<Return>(
      'return_update_status',
      { data },
      options.selection ?? RETURN,
      options
    );
  }

  receiveLineItem(data: ReceiveReturnLineItemInput, options: MutateOptions = {}): Promise<Return> {
    return this.runMutation<Return>(
      'return_receive_line_item',
      { data },
      options.selection ?? RETURN,
      options
    );
  }

  createExchange(
    data: CreateReturnExchangeInput,
    options: MutateOptions = {}
  ): Promise<ReturnExchange> {
    return this.runMutation<ReturnExchange>(
      'return_create_exchange',
      { data },
      options.selection ?? 'id legacy_id return_id created_at',
      options
    );
  }
}
