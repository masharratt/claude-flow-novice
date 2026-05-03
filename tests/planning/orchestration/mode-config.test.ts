import { getModeConfig, MODE_CONFIGS, OrchestratorMode } from '../../../src/planning/orchestration/mode-config';

describe('mode-config', () => {
  describe('getModeConfig', () => {
    it('returns correct values for mvp', () => {
      const config = getModeConfig('mvp');
      expect(config.gateThreshold).toBe(0.70);
      expect(config.consensusThreshold).toBe(0.80);
      expect(config.maxIterations).toBe(5);
      expect(config.validatorCount).toBe(2);
    });

    it('returns correct values for standard', () => {
      const config = getModeConfig('standard');
      expect(config.gateThreshold).toBe(0.95);
      expect(config.consensusThreshold).toBe(0.90);
      expect(config.maxIterations).toBe(10);
      expect(config.validatorCount).toBe(3);
    });

    it('returns correct values for enterprise', () => {
      const config = getModeConfig('enterprise');
      expect(config.gateThreshold).toBe(0.98);
      expect(config.consensusThreshold).toBe(0.95);
      expect(config.maxIterations).toBe(15);
      expect(config.validatorCount).toBe(5);
    });

    it('returns undefined for invalid mode', () => {
      const config = getModeConfig('invalid' as OrchestratorMode);
      expect(config).toBeUndefined();
    });
  });

  describe('MODE_CONFIGS', () => {
    it('contains all three modes', () => {
      expect(Object.keys(MODE_CONFIGS)).toEqual(['mvp', 'standard', 'enterprise']);
    });

    it('all configs have required fields', () => {
      for (const mode of ['mvp', 'standard', 'enterprise'] as OrchestratorMode[]) {
        const config = MODE_CONFIGS[mode];
        expect(typeof config.gateThreshold).toBe('number');
        expect(typeof config.consensusThreshold).toBe('number');
        expect(typeof config.maxIterations).toBe('number');
        expect(typeof config.validatorCount).toBe('number');
      }
    });

    it('thresholds are ordered correctly (mvp < standard < enterprise)', () => {
      expect(MODE_CONFIGS.mvp.gateThreshold).toBeLessThan(MODE_CONFIGS.standard.gateThreshold);
      expect(MODE_CONFIGS.standard.gateThreshold).toBeLessThan(MODE_CONFIGS.enterprise.gateThreshold);
      expect(MODE_CONFIGS.mvp.consensusThreshold).toBeLessThan(MODE_CONFIGS.standard.consensusThreshold);
      expect(MODE_CONFIGS.standard.consensusThreshold).toBeLessThan(MODE_CONFIGS.enterprise.consensusThreshold);
    });
  });
});
