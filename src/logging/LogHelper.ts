import * as bunyan from 'bunyan';

export interface ILogHelper {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
  child(options: object): ILogHelper;
}

export class LogHelper implements ILogHelper {
  private logger: bunyan;

  constructor(serviceName: string, options?: bunyan.LoggerOptions) {
    this.logger = bunyan.createLogger({
      name: serviceName,
      ...options
    });
  }

  public debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }

  public info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  public error(message: string, error?: Error, ...args: any[]): void {
    if (error) {
      this.logger.error({ err: error }, message, ...args);
    } else {
      this.logger.error(message, ...args);
    }
  }

  public child(options: Object): ILogHelper {
    const childLogger = this.logger.child(options);
    const helper = new LogHelper(childLogger.fields.name);
    helper.logger = childLogger;
    return helper;
  }
} 