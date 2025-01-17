import { LogHelper } from '../../src/logging';

describe('LogHelper', () => {
  let logger: LogHelper;

  beforeEach(() => {
    logger = new LogHelper('TestService');
  });

  it('should create a logger instance', () => {
    expect(logger).toBeInstanceOf(LogHelper);
  });

  it('should log messages at different levels', () => {
    expect(() => {
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
    }).not.toThrow();
  });

  it('should handle additional metadata', () => {
    expect(() => {
      logger.info('Message with metadata', { key: 'value' });
    }).not.toThrow();
  });

  it('should create child loggers', () => {
    const childLogger = logger.child({ component: 'ChildComponent' });
    expect(childLogger).toBeInstanceOf(LogHelper);
  });

  it('should handle errors with stack traces', () => {
    const error = new Error('Test error');
    expect(() => {
      logger.error('Error occurred', error, { additionalInfo: 'test' });
    }).not.toThrow();
  });
}); 