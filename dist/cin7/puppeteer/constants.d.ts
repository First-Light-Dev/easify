export declare const GLOBAL: {
    url: string;
};
export declare const LOGIN: {
    url: string;
    selectors: {
        username: string;
        password: string;
        loginButton: string;
        loginURLIdentifier: string;
        twoFAURLIdentifier: string;
        twoFA: string;
        twoFAButton: string;
    };
};
export declare const CREDIT_NOTES: {
    getUrl: (id: string) => string;
    selectors: {
        branchOptionOpenDialogButton: string;
        branchOptions: string;
        qtyMovedFields: string;
        getQtyMovedField: (nthChild: number) => string;
        skuFields: string;
        getSkuField: (nthChild: number) => string;
        actualQtyMovedField: string;
        batchNumberField: string;
        saveIntakeButton: string;
        completedDateField: string;
        completedTimeField: string;
        approveButton: string;
        adminButton: string;
        voidButton: string;
        saveButton: string;
    };
};
