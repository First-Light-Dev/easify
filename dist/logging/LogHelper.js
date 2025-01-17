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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogHelper = void 0;
const bunyan = __importStar(require("bunyan"));
class LogHelper {
    constructor(serviceName, options) {
        this.logger = bunyan.createLogger({
            name: serviceName,
            ...options
        });
    }
    static initialize(serviceName, options) {
        if (LogHelper.isInitialized) {
            console.warn('LogHelper is already initialized. Ignoring re-initialization attempt.');
            return LogHelper.instance;
        }
        LogHelper.instance = new LogHelper(serviceName, options);
        LogHelper.isInitialized = true;
        return LogHelper.instance;
    }
    static getInstance() {
        if (!LogHelper.isInitialized) {
            throw new Error('LogHelper not initialized. Call initialize() first with a service name.');
        }
        return LogHelper.instance;
    }
    debug(message, ...args) {
        this.logger.debug(message, ...args);
    }
    info(message, ...args) {
        this.logger.info(message, ...args);
    }
    warn(message, ...args) {
        this.logger.warn(message, ...args);
    }
    error(message, error, ...args) {
        if (error) {
            this.logger.error({ err: error }, message, ...args);
        }
        else {
            this.logger.error(message, ...args);
        }
    }
}
exports.LogHelper = LogHelper;
LogHelper.isInitialized = false;
