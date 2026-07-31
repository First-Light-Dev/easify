import { AxiosInstance } from 'axios';
import { QueryOptions, ResourceOptions, WritableResource } from './base/Resource';
import { Lead, LeadSchema, Opportunity, OpportunitySchema } from './types/Crm';

/** https://dearinventory.docs.apiary.io/#reference/crm */
export default class Crm {
  readonly leads: WritableResource<typeof LeadSchema>;
  readonly opportunities: WritableResource<typeof OpportunitySchema>;

  constructor(axios: AxiosInstance, options: ResourceOptions = {}) {
    this.leads = new WritableResource(axios, '/crm/lead', LeadSchema, 'LeadList', options);
    this.opportunities = new WritableResource(
      axios,
      '/crm/opportunity',
      OpportunitySchema,
      'opportunityList',
      options
    );
  }

  listLeads(params: QueryOptions = {}) {
    return this.leads.list(params);
  }

  listOpportunities(params: QueryOptions = {}) {
    return this.opportunities.list(params);
  }
}

export type { Lead, Opportunity };
