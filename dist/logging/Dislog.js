"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
class Dislog {
    static initialize(webhook, userID) {
        if (this.isInit) {
            return this.instance;
        }
        this.instance = new Dislog(webhook, userID);
        this.isInit = true;
        return this.instance;
    }
    static getInstance() {
        if (this.isInit) {
            return this.instance;
        }
        throw new Error('Dislog not initialized. Call initialize() first.');
    }
    constructor(webhook, userID) {
        this.webhook = webhook;
        this.userID = userID;
    }
    async log(message) {
        try {
            await axios_1.default.post(this.webhook, {
                content: message
            });
        }
        catch (error) {
            console.error("Error sending log to Discord", error);
        }
    }
    async alert(message) {
        try {
            await axios_1.default.post(this.webhook, {
                content: `<@${this.userID}> \n ${message}`
            });
        }
        catch (error) {
            console.error("Error sending alert to Discord", error);
        }
    }
}
Dislog.isInit = false;
exports.default = Dislog;
