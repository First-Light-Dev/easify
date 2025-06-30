export const GLOBAL = {
    url: "https://go.cin7.com/Cloud/Dashboard/HomePageDashboard.aspx"
}

export const LOGIN = {
    url: "https://auth.cin7.com/Account/Login",

    // Form Fields
    selectors: {
        // Login Form
        username: "#usernameInput",
        password: "#passwordInput",
        loginButton: "#Identity-Forms  [type='submit']",
        loginURLIdentifier: "Login",

        // Two Factor Authentication
        twoFAURLIdentifier: "LoginWith2fa",
        twoFA: "#Input_TwoFactorCode",
        twoFAButton: "#Identity-Forms  [type='submit']",

    }
}

export const CREDIT_NOTES = {
    
    getUrl: (appLinkId: string, id: string) => `https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?idCustomerAppsLink=${appLinkId}&OrderId=${id}`,
    selectors: {
        branchOptionOpenDialogButton: "#BranchSelectedLink",
        branchOptions: "#MenuPanel1 a",
        qtyMovedFields: "#StockGrid tr td:nth-child(13)",
        getQtyMovedField: (nthChild: number) => `#StockGrid tr:nth-child(${nthChild}) td:nth-child(13)`,
        skuFields: "#StockGrid tr td:nth-child(4) pre",
        internalCommentsFields: "#StockGrid tr td:nth-child(18) pre",
        getSkuField: (nthChild: number) => `#StockGrid tr:nth-child(${nthChild}) td:nth-child(4) pre`,
        getInternalCommentsField: (nthChild: number) => `#StockGrid tr:nth-child(${nthChild}) td:nth-child(18) pre`,
        actualQtyMovedField: "#SerialNumbers_intQtyItem",
        batchNumberField: "#SerialNumbers_strSerialAvailable",
        saveIntakeButton: "#SerialNumber_SaveButton",
        completedDateField: "#ctl00_ContentPlaceHolder1_datOrders_87",
        completedTimeField: "#ctl00_ContentPlaceHolder1_datOrders_87_Time",
        approveButton: "#ctl00_ContentPlaceHolder1_ApproveButton",
        adminButton: "#AdminButton",
        voidButton: "#ctl00_ContentPlaceHolder1_DeleteLinkButton",
        saveButton: "#ctl00_ContentPlaceHolder1_SaveButton",
    }
}

export const SALES_ORDERS = {
    getUrl: (appLinkId: string, id: string) => `https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?idCustomerAppsLink=${appLinkId}&OrderId=${id}`,
    selectors: {
        adminButton: "#AdminButton",
        voidButton: "#ctl00_ContentPlaceHolder1_DeleteLinkButton",
    }
}