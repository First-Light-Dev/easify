import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import SalesOrders from "./resources/SalesOrders";
import CreditNotes from "./resources/CreditNotes";
import ProductOptions from "./resources/ProductOptions";
import puppeteer, { Browser, Configuration, Page } from "puppeteer";
import { GLOBAL, LOGIN } from "./puppeteer/constants";
import * as authenticator from "authenticator";
import Payments from "./resources/Payments";
import { join } from "path";
import { APICallCounter } from "./resources/types";

// Update the interface to extend InternalAxiosRequestConfig
interface EasifyCin7AxiosRequestConfig extends InternalAxiosRequestConfig {
    apiKeyIndex?: string;
}

export interface Cin7Config {
    auth: {
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
    options?: {
        headless?: boolean;
        puppeteer?: {
            appLinkIds?: {
                creditNotes: string;
                salesOrders: string;
            }
        }
        multiAPIKeyHandling?: {
            enabled: boolean;
            additionalAPIKeys: string[];
            keyCounter: APICallCounter;
            cutoffAPICallCount: number;
        }
    }

}

export default class Cin7 {
    public config: Cin7Config;


    private axios: AxiosInstance;
    private browser: Browser | null;
    private page: Page | null;
    private isLoggedIn: boolean;
    private hasDialogHandler: boolean;

    public salesOrders: SalesOrders;
    public creditNotes: CreditNotes;
    public payments: Payments;
    public productOptions: ProductOptions;
    
    constructor(config: Cin7Config) {
        this.config = config;
        this.axios = axios.create({
            baseURL: "https://api.cin7.com/api/v1",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(`${this.config.auth.api.username}:${this.config.auth.api.password}`).toString("base64")}`,
            },
        });

        this.axios.interceptors.request.use(async (config: EasifyCin7AxiosRequestConfig) => {
            console.log("Cin7 Request URL", config.baseURL, config.url);

            if (!this.config.options?.multiAPIKeyHandling?.enabled) {
                return config;
            }

            const cin7ApiKeys = [this.config.auth.api.password, ...(this.config.options?.multiAPIKeyHandling?.additionalAPIKeys ?? [])];

            const apiCallCounts = await this.config.options?.multiAPIKeyHandling?.keyCounter.get();
            const apiKeyIndex = Object.keys(apiCallCounts).findIndex((count) => apiCallCounts[count] < (this.config.options?.multiAPIKeyHandling?.cutoffAPICallCount ?? 4900));
            
            if (apiKeyIndex === -1) {
                throw new Error("All API keys have reached their rate limit");
            }
            
            config.apiKeyIndex = `${apiKeyIndex}`;
            config.headers['Authorization'] = `Basic ${Buffer.from(`${this.config.auth.api.username}:${cin7ApiKeys[apiKeyIndex]}`).toString('base64')}`;
            return config;
        });

        // A basic retry mechanism for 429 errors
        this.axios.interceptors.response.use(
            async response => {
                if (this.config.options?.multiAPIKeyHandling?.enabled) {
                    await this.config.options?.multiAPIKeyHandling?.keyCounter.increment(`${(response.config as EasifyCin7AxiosRequestConfig).apiKeyIndex}`);
                }
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
        this.productOptions = new ProductOptions(this.axios, this);
        this.isLoggedIn = false;
        this.page = null;
        this.browser = null;
        this.hasDialogHandler = false;
    }

    private ensureDialogHandler(page: Page) {
        if (!this.hasDialogHandler) {
            page.on('dialog', async dialog => {
                console.log(`Dialog message: ${dialog.message()}`);
                await dialog.accept();
            });
            this.hasDialogHandler = true;
        }
    }

    async loadPuppeteerConfig(): Promise<Partial<Configuration>> {
        try {
            // Try to load the config from the application root
            const configPath = join(process.cwd(), '.puppeteerrc.cjs');
            const config = require(configPath);
            return config;
        } catch (error) {
            // Fallback to default configuration if no .puppeteerrc.cjs is found
            return {};
        }
    }

    async getPuppeteerPage(): Promise<Page> {
        if (this.isLoggedIn && this.page) {
            return this.page;
        }

        const browser = await puppeteer.launch({
            timeout: 0,
            headless: this.config.options?.headless || false,
            slowMo: 0,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-first-run',
                '--no-sandbox',
                '--no-zygote',
                '--window-size=1280,720',
            ],
        });

        this.browser = browser;

        let page = await browser.newPage();

        await page.goto(LOGIN.url);

        if (!page.url().includes(LOGIN.selectors.loginURLIdentifier) && !page.url().includes(LOGIN.selectors.twoFAURLIdentifier)) {
            throw new Error("Failed to login");
        }

        if (!this.config.auth.ui) {
            throw new Error("UI credentials not initialized. Call Cin7.init() with ui credentials first");
        }

        await page.type(LOGIN.selectors.username, this.config.auth.ui.username);
        await page.type(LOGIN.selectors.password, this.config.auth.ui.password);

        await Promise.all([
            page.waitForNavigation({
                waitUntil: "domcontentloaded"
            }),
            page.click(LOGIN.selectors.loginButton)
        ])

        const currentUrl = page.url();

        // check if the url contains the word "dashboard"
        if (currentUrl.includes(LOGIN.selectors.twoFAURLIdentifier)) {
            await page.type(LOGIN.selectors.twoFA, authenticator.generateToken(this.config.auth.ui.otpSecret || ""));

            const [response] = await Promise.all([
                page.waitForNavigation({
                    waitUntil: "domcontentloaded"
                }),
                page.click(LOGIN.selectors.twoFAButton),
            ]);

            if (!response) {
                throw new Error("Failed to login twofa");
            }
        }

        this.ensureDialogHandler(page);
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
            this.hasDialogHandler = false;
        }
    }

}

export * from "./resources/types";