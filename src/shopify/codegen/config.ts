export const defaultCodegenConfig = {
    schema: 'https://shopify.dev/admin-graphql-direct-proxy',
    documents: 'src/**/*.graphql',
    generates: {
        'src/generated/types.ts': {
            plugins: ['typescript', 'typescript-operations'],
            config: {
                scalars: {
                    Boolean: 'boolean',
                    DateTime: 'string',
                    Date: 'string',
                    DateTimeWithoutTimezone: 'string',
                    Decimal: 'string',
                    Float: 'number',
                    Handle: 'string',
                    ID: 'string',
                    Int: 'number',
                    JSON: 'Record<string, any>',
                    String: 'string',
                    TimeWithoutTimezone: 'string',
                    Void: 'void'
                }
            }
        }
    }
};
