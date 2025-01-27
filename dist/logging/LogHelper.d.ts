import * as bunyan from 'bunyan';
export interface ILogHelper {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: Error, ...args: any[]): void;
}
export interface LogHelperOptions {
    serviceName: string;
    discord?: {
        webhookUrl: string;
        userId: string;
    };
    options?: bunyan.LoggerOptions;
}
export declare class LogHelper implements ILogHelper {
    private logger;
    private static instance;
    private static isInitialized;
    private constructor();
    static initialize(serviceName: string, options?: bunyan.LoggerOptions): LogHelper;
    static getInstance(): LogHelper;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: Error, ...args: any[]): void;
}
