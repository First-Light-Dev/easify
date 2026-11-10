import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions } from './base/Resource';
import {
  PaymentFee,
  PaymentFeeSchema,
  PaymentPayout,
  PaymentPayoutSchema
} from './types/FeesAndPayouts';

/**
 * https://api.cin7.com/api/Help#FeesAndPayouts
 *
 * Cin7 Pay fees and payouts. Both are read-only and are usually filtered by date through the
 * `where` option, e.g. `{ where: "createdDate>='2026-01-01T00:00:00Z'" }`.
 */
export default class FeesAndPayouts {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly options: ResourceOptions = {}
  ) {}

  private parseMany<T>(payload: unknown, schema: { parse: (value: unknown) => T }): T[] {
    if (!Array.isArray(payload)) return [];
    if (this.options.validate === false) return payload as T[];
    return payload.map((item) => schema.parse(item));
  }

  /** Fetches a page of payment fees. */
  async fees(options: QueryOptions = {}): Promise<PaymentFee[]> {
    const response = await this.axios.get('/v1/PaymentFeesAndPayouts/Fees', { params: options });
    return this.parseMany(response.data, PaymentFeeSchema);
  }

  /** Fetches a page of payouts. */
  async payouts(options: QueryOptions = {}): Promise<PaymentPayout[]> {
    const response = await this.axios.get('/v1/PaymentFeesAndPayouts/Payouts', { params: options });
    return this.parseMany(response.data, PaymentPayoutSchema);
  }
}
