import { AxiosInstance } from 'axios';
import { QueryOptions, ReadableResource, ResourceOptions, WritableResource } from './base/Resource';
import {
  AttributeSet,
  AttributeSetSchema,
  BankAccounts,
  BankAccountsSchema,
  Brand,
  BrandSchema,
  Carrier,
  CarrierSchema,
  ChartOfAccounts,
  ChartOfAccountsSchema,
  Location,
  LocationSchema,
  PaymentTerm,
  PaymentTermSchema,
  PriceTier,
  PriceTierSchema,
  Tax,
  TaxSchema,
  UnitOfMeasure,
  UnitOfMeasureSchema
} from './types/Reference';

/** Reference-book endpoints under `/ref/*`. */
export default class Reference {
  readonly attributeSets: WritableResource<typeof AttributeSetSchema>;
  readonly bankAccounts: ReadableResource<typeof BankAccountsSchema>;
  readonly brands: WritableResource<typeof BrandSchema>;
  readonly carriers: WritableResource<typeof CarrierSchema>;
  readonly chartOfAccounts: WritableResource<typeof ChartOfAccountsSchema>;
  readonly locations: WritableResource<typeof LocationSchema>;
  readonly paymentTerms: WritableResource<typeof PaymentTermSchema>;
  readonly priceTiers: ReadableResource<typeof PriceTierSchema>;
  readonly taxRules: WritableResource<typeof TaxSchema>;
  readonly unitsOfMeasure: WritableResource<typeof UnitOfMeasureSchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    this.attributeSets = new WritableResource(
      axios,
      '/ref/attributeset',
      AttributeSetSchema,
      'AttributeSetList',
      options
    );
    this.bankAccounts = new ReadableResource(
      axios,
      '/ref/account/bank',
      BankAccountsSchema,
      'BankAccountsList',
      options
    );
    this.brands = new WritableResource(axios, '/ref/brand', BrandSchema, 'BrandList', options);
    this.carriers = new WritableResource(
      axios,
      '/ref/carrier',
      CarrierSchema,
      'CarrierList',
      { ...options, idParam: 'CarrierID' }
    );
    this.chartOfAccounts = new WritableResource(
      axios,
      '/ref/account',
      ChartOfAccountsSchema,
      'AccountsList',
      options
    );
    this.locations = new WritableResource(
      axios,
      '/ref/location',
      LocationSchema,
      'LocationList',
      options
    );
    this.paymentTerms = new WritableResource(
      axios,
      '/ref/paymentterm',
      PaymentTermSchema,
      'PaymentTermList',
      options
    );
    this.priceTiers = new ReadableResource(
      axios,
      '/ref/priceTier',
      PriceTierSchema,
      'PriceTiers',
      options
    );
    this.taxRules = new WritableResource(axios, '/ref/tax', TaxSchema, 'TaxRuleList', options);
    this.unitsOfMeasure = new WritableResource(
      axios,
      '/ref/unit',
      UnitOfMeasureSchema,
      'UnitList',
      options
    );
  }

  listLocations(params: QueryOptions = {}) {
    return this.locations.list(params);
  }
}

export type {
  AttributeSet,
  BankAccounts,
  Brand,
  Carrier,
  ChartOfAccounts,
  Location,
  PaymentTerm,
  PriceTier,
  Tax,
  UnitOfMeasure
};
