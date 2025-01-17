import * as bunyan from 'bunyan';
export interface ILogHelper {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: Error, ...args: any[]): void;
    child(options: object): ILogHelper;
}
export declare class LogHelper implements ILogHelper {
    private logger;
    constructor(serviceName: string, options?: bunyan.LoggerOptions);
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: Error, ...args: any[]): void;
    child(options: Object): ILogHelper;
}
