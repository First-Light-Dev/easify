import SalesOrders from "./resources/SalesOrders";
import CreditNotes from "./resources/CreditNotes";
import { Page } from "puppeteer";
import Payments from "./resources/Payments";
export interface Cin7Config {
    api: {
        username: string;
        password: string;
    };
    ui?: {
        username: string;
        password: string;
        otpSecret: string;
    };
}
export default class Cin7 {
    private config;
    private axios;
    private browser;
    private page;
    private isLoggedIn;
    salesOrders: SalesOrders;
    creditNotes: CreditNotes;
    payments: Payments;
    private constructor();
    getPuppeteerPage(): Promise<Page>;
    closeBrowser(): Promise<void>;
}
