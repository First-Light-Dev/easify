import { LogHelper } from '../../src/logging';

describe('LogHelper', () => {
  let logger: LogHelper;

  beforeEach(() => {

    logger = LogHelper.initialize({ serviceName: 'TestService' });

    LogHelper['isInit'] = false;
    (LogHelper['instance'] as any) = null;
  });

  describe('initialize', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeInstanceOf(LogHelper);
    });

    it('should return the same instance on subsequent calls', () => {
      const instance1 = LogHelper.initialize({ serviceName: 'TestService' });
      const instance2 = LogHelper.initialize({ serviceName: 'TestService' });
      expect(instance1).toBe(instance2);
    });
  });

  describe('getInstance', () => {
    it('should throw an error if not initialized', () => {
      expect(() => LogHelper.getInstance()).toThrow('LogHelper not initialized. Call initialize() first with a service name.');
    });
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

  it('should handle errors with stack traces', () => {
    const error = new Error('Test error');
    expect(() => {
      logger.error('Error occurred', error, { additionalInfo: 'test' });
    }).not.toThrow();
  });
}); 