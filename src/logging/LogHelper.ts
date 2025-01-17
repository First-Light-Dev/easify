import * as bunyan from 'bunyan';
import Dislog from './Dislog';

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
  }
  options?: bunyan.LoggerOptions;
}

export class LogHelper implements ILogHelper {
  private logger: bunyan;
  private static instance: LogHelper;
  private static isInit = false;
  private dislog?: Dislog;

  private constructor(options: LogHelperOptions) {
    this.logger = bunyan.createLogger({
      name: options.serviceName,
      ...options.options
    });

    if (options.discord) {
      this.dislog = Dislog.initialize(
        options.discord.webhookUrl,
        options.discord.userId
      );
    }
  }

  public static initialize(options: LogHelperOptions): LogHelper {
    if (LogHelper.isInit) {
      console.warn('LogHelper is already initialized. Ignoring re-initialization attempt.');
      return LogHelper.instance;
    }

    LogHelper.instance = new LogHelper(options);
    LogHelper.isInit = true;
    return LogHelper.instance;
  }

  public static getInstance(): LogHelper {
    if (!LogHelper.isInit) {
      throw new Error('LogHelper not initialized. Call initialize() first with a service name.');
    }
    return LogHelper.instance;
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
      this.dislog?.alert(`Error: ${message}\n${error.stack || error.message}`);
    } else {
      this.logger.error(message, ...args);
      this.dislog?.alert(`Error: ${message}`);
    }
  }
} 