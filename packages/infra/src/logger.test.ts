import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import { createLogger } from './logger';

describe('createLogger', () => {
  let consoleSpy: {
    log: ReturnType<typeof spyOn>;
    warn: ReturnType<typeof spyOn>;
    error: ReturnType<typeof spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: spyOn(console, 'log').mockImplementation(() => {}),
      warn: spyOn(console, 'warn').mockImplementation(() => {}),
      error: spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('debug level', () => {
    it('should log debug messages with service tag', () => {
      const logger = createLogger('TestService');
      logger.debug('test message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TestService]', 'test message');
    });

    it('should log with multiple arguments', () => {
      const logger = createLogger('TestService');
      logger.debug('message', { data: 123 }, 'extra');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[TestService]',
        'message',
        { data: 123 },
        'extra',
      );
    });
  });

  describe('info level', () => {
    it('should log info messages', () => {
      const logger = createLogger('TestService');
      logger.info('info message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TestService]', 'info message');
    });
  });

  describe('warn level', () => {
    it('should log warn messages to console.warn', () => {
      const logger = createLogger('TestService');
      logger.warn('warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[TestService]', 'warning message');
    });
  });

  describe('error level', () => {
    it('should log error messages to console.error', () => {
      const logger = createLogger('TestService');
      logger.error('error message');

      expect(consoleSpy.error).toHaveBeenCalledWith('[TestService]', 'error message');
    });

    it('should handle error objects', () => {
      const logger = createLogger('TestService');
      const error = new Error('test error');
      logger.error('failed', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[TestService]', 'failed', error);
    });
  });

  describe('log level filtering', () => {
    it('should filter debug when level is info', () => {
      const logger = createLogger('TestService', { level: 'info' });
      logger.debug('should not appear');
      logger.info('should appear');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).toHaveBeenCalledWith('[TestService]', 'should appear');
    });

    it('should filter debug and info when level is warn', () => {
      const logger = createLogger('TestService', { level: 'warn' });
      logger.debug('no');
      logger.info('no');
      logger.warn('yes');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });

    it('should only show errors when level is error', () => {
      const logger = createLogger('TestService', { level: 'error' });
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('time/timeEnd', () => {
    it('should measure time duration', () => {
      const logger = createLogger('TestService');

      logger.time('operation');
      // Simulate some work
      logger.timeEnd('operation');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[TestService]',
        expect.stringMatching(/^⏱️ operation: \d+ms$/),
      );
    });

    it('should handle multiple timers', () => {
      const logger = createLogger('TestService');

      logger.time('first');
      logger.time('second');
      logger.timeEnd('second');
      logger.timeEnd('first');

      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    });

    it('should handle missing timer silently', () => {
      const logger = createLogger('TestService');

      // timeEnd without time should not throw
      expect(() => logger.timeEnd('nonexistent')).not.toThrow();
    });
  });

  describe('service tag', () => {
    it('should use different tags for different services', () => {
      const logger1 = createLogger('Service1');
      const logger2 = createLogger('Service2');

      logger1.info('from 1');
      logger2.info('from 2');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Service1]', 'from 1');
      expect(consoleSpy.log).toHaveBeenCalledWith('[Service2]', 'from 2');
    });
  });
});
