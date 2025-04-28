import axios, { AxiosInstance } from "axios";
import SalesOrders from "./resources/SalesOrders";
import CreditNotes from "./resources/CreditNotes";
import puppeteer, { Browser, Page } from "puppeteer";
import { LOGIN } from "./puppeteer/constants";
import * as authenticator from "authenticator";
import Payments from "./resources/Payments";

export interface Cin7Config {
    api: {
        username: string;
        password: string;
    }
    ui?: {
        username: string;
        password: string;
        otpSecret: string;
    }
}

export default class Cin7 {
    private config: Cin7Config;

  
    private axios: AxiosInstance;
    private browser: Browser | null;
    private page: Page | null;
    private isLoggedIn: boolean;

    public salesOrders: SalesOrders;
    public creditNotes: CreditNotes;
    public payments: Payments;

    constructor(config: Cin7Config) {
        this.config = config;
        this.axios = axios.create({
            baseURL: "https://api.cin7.com/api/v1",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(`${this.config.api.username}:${this.config.api.password}`).toString("base64")}`,
            },
        });

        // A basic retry mechanism for 429 errors
        this.axios.interceptors.response.use(
            async response => {
                return response;
            },
            async (error: any) => {
                const { config, response } = error;

                if (response?.status !== 429) {
                    return Promise.reject(error);
                }

                console.log("Retrying request");

                config.__retryCount = config.__retryCount || 0;

                if (config.__retryCount >= config.retry || config.__retryCount >= 10) {
                    return Promise.reject(error);
                }

                config.__retryCount += 1;

                const backoff = new Promise<void>((resolve) => {
                    const delay = Math.min(1000 * (2 ** config.__retryCount), 8000); // Capped at 30 seconds
                    const jitter = (Math.random() - 0.5) * 1000; // Add up to 1 second of jitter
                    setTimeout(() => {
                        resolve();
                    }, delay + jitter);
                });

                await backoff;
                return this.axios(config);
            }
        );

        // Initialize resources
        this.salesOrders = new SalesOrders(this.axios, this);
        this.creditNotes = new CreditNotes(this.axios, this);
        this.payments = new Payments(this.axios, this);
        this.isLoggedIn = false;
        this.page = null;
        this.browser = null;
    }

    async getPuppeteerPage(): Promise<Page> {
        if (this.isLoggedIn && this.page) {
            return this.page;
        }

        const browser = await puppeteer.launch({
            timeout: 0,
            headless: false,
            slowMo: 2,
            defaultViewport: {
                width: 1024,
                height: 768,
            },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
        });

        this.browser = browser;

        let page = await browser.newPage();

        await page.goto(LOGIN.url);

        if (!page.url().includes(LOGIN.selectors.loginURLIdentifier) && !page.url().includes(LOGIN.selectors.twoFAURLIdentifier)) {
            throw new Error("Failed to login");
        }

        if(!this.config.ui) {
            throw new Error("UI credentials not initialized. Call Cin7.init() with ui credentials first");
        }

        await page.type(LOGIN.selectors.username, this.config.ui.username);
        await page.type(LOGIN.selectors.password, this.config.ui.password);

        const [response] = await Promise.all([
            page.waitForNavigation({
                waitUntil: 'networkidle0'
            }),
            page.click(LOGIN.selectors.loginButton)
        ]);

        if (!response) {
            throw new Error("Failed to login");
        }

        // check if the url contains the word "dashboard"
        if (response.url().includes(LOGIN.selectors.twoFAURLIdentifier)) {
            await page.type(LOGIN.selectors.twoFA, authenticator.generateToken(this.config.ui.otpSecret || ""));

            const [response] = await Promise.all([
                page.waitForNavigation({
                    waitUntil: 'networkidle0'
                }),
                page.click(LOGIN.selectors.twoFAButton),
            ]);

            if (!response) {
                throw new Error("Failed to login twofa");
            }
        }


        this.page = page;
        this.isLoggedIn = true;

        return this.page;
    }

    async closeBrowser(): Promise<void> {
        console.log("Closing browser");
        if (!!this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
        }
    }

}

export * from "./resources/types";