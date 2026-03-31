import { describe, expect, it } from 'bun:test';
import { createSeededRandom, cryptoRandom } from './random-port';

describe('random-port', () => {
  describe('cryptoRandom', () => {
    it('should generate random numbers between 0 and 1', () => {
      const value = cryptoRandom.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });

    it('should generate valid UUIDs', () => {
      const id = cryptoRandom.generateId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('createSeededRandom', () => {
    it('should create a random port with seed', () => {
      const random = createSeededRandom('test-seed');

      expect(random.getSeed?.()).toBe('test-seed');
    });

    it('should produce deterministic random values', () => {
      const random1 = createSeededRandom('seed-123');
      const random2 = createSeededRandom('seed-123');

      const values1 = [random1.random(), random1.random(), random1.random()];
      const values2 = [random2.random(), random2.random(), random2.random()];

      expect(values1).toEqual(values2);
    });

    it('should produce different values for different seeds', () => {
      const random1 = createSeededRandom('seed-a');
      const random2 = createSeededRandom('seed-b');

      const value1 = random1.random();
      const value2 = random2.random();

      expect(value1).not.toBe(value2);
    });

    it('should generate values between 0 and 1', () => {
      const random = createSeededRandom('test');

      for (let i = 0; i < 100; i++) {
        const value = random.random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should generate deterministic IDs', () => {
      const random1 = createSeededRandom('id-seed');
      const random2 = createSeededRandom('id-seed');

      const id1a = random1.generateId();
      const id1b = random1.generateId();
      const id2a = random2.generateId();
      const id2b = random2.generateId();

      expect(id1a).toBe(id2a);
      expect(id1b).toBe(id2b);
    });

    it('should generate unique IDs within same instance', () => {
      const random = createSeededRandom('unique-test');

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(random.generateId());
      }

      expect(ids.size).toBe(100);
    });

    it('should format IDs with seed prefix', () => {
      const random = createSeededRandom('my-seed');
      const id = random.generateId();

      expect(id).toMatch(/^my-seed-/);
    });
  });
});
