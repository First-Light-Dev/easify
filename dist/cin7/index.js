"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const SalesOrders_1 = __importDefault(require("./resources/SalesOrders"));
const CreditNotes_1 = __importDefault(require("./resources/CreditNotes"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const constants_1 = require("./puppeteer/constants");
const authenticator = __importStar(require("authenticator"));
const Payments_1 = __importDefault(require("./resources/Payments"));
class Cin7 {
    constructor(config) {
        this.config = config;
        this.axios = axios_1.default.create({
            baseURL: "https://api.cin7.com/api/v1",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Basic ${Buffer.from(`${this.config.api.username}:${this.config.api.password}`).toString("base64")}`,
            },
        });
        // A basic retry mechanism for 429 errors
        this.axios.interceptors.response.use(async (response) => {
            return response;
        }, async (error) => {
            const { config, response } = error;
            if ((response === null || response === void 0 ? void 0 : response.status) !== 429) {
                return Promise.reject(error);
            }
            console.log("Retrying request");
            config.__retryCount = config.__retryCount || 0;
            if (config.__retryCount >= config.retry || config.__retryCount >= 10) {
                return Promise.reject(error);
            }
            config.__retryCount += 1;
            const backoff = new Promise((resolve) => {
                const delay = Math.min(1000 * (2 ** config.__retryCount), 8000); // Capped at 30 seconds
                const jitter = (Math.random() - 0.5) * 1000; // Add up to 1 second of jitter
                setTimeout(() => {
                    resolve();
                }, delay + jitter);
            });
            await backoff;
            return this.axios(config);
        });
        // Initialize resources
        this.salesOrders = new SalesOrders_1.default(this.axios, this);
        this.creditNotes = new CreditNotes_1.default(this.axios, this);
        this.payments = new Payments_1.default(this.axios, this);
        this.isLoggedIn = false;
        this.page = null;
        this.browser = null;
    }
    async getPuppeteerPage() {
        if (this.isLoggedIn && this.page) {
            return this.page;
        }
        const browser = await puppeteer_1.default.launch({
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
        await page.goto(constants_1.LOGIN.url);
        if (!page.url().includes(constants_1.LOGIN.selectors.loginURLIdentifier) && !page.url().includes(constants_1.LOGIN.selectors.twoFAURLIdentifier)) {
            throw new Error("Failed to login");
        }
        if (!this.config.ui) {
            throw new Error("UI credentials not initialized. Call Cin7.init() with ui credentials first");
        }
        await page.type(constants_1.LOGIN.selectors.username, this.config.ui.username);
        await page.type(constants_1.LOGIN.selectors.password, this.config.ui.password);
        const [response] = await Promise.all([
            page.waitForNavigation({
                waitUntil: 'networkidle0'
            }),
            page.click(constants_1.LOGIN.selectors.loginButton)
        ]);
        if (!response) {
            throw new Error("Failed to login");
        }
        // check if the url contains the word "dashboard"
        if (response.url().includes(constants_1.LOGIN.selectors.twoFAURLIdentifier)) {
            await page.type(constants_1.LOGIN.selectors.twoFA, authenticator.generateToken(this.config.ui.otpSecret || ""));
            const [response] = await Promise.all([
                page.waitForNavigation({
                    waitUntil: 'networkidle0'
                }),
                page.click(constants_1.LOGIN.selectors.twoFAButton),
            ]);
            if (!response) {
                throw new Error("Failed to login twofa");
            }
        }
        this.page = page;
        this.isLoggedIn = true;
        return this.page;
    }
    async closeBrowser() {
        console.log("Closing browser");
        if (!!this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
        }
    }
}
exports.default = Cin7;
__exportStar(require("./resources/types"), exports);
