const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class CFNLoopValidator {
  constructor(config = {}) {
    this.mode = config.mode || 'standard';
    this.maxRetries = config.maxRetries || 10;
    this.consensusThreshold = this.getThresholdForMode(this.mode);
    this.validatorCount = config.validatorCount || 3;

    // Initialize database
    this.db = new sqlite3.Database(path.join(__dirname, 'evidence-chain.db'));
    this.initializeDatabase();
  }

  getThresholdForMode(mode) {
    const thresholds = {
      mvp: 0.7,
      standard: 0.85,
      enterprise: 0.95,
    };
    return thresholds[mode] || thresholds.standard;
  }

  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
                    CREATE TABLE IF NOT EXISTS validation_evidence (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        template_id TEXT,
                        validator_id TEXT,
                        score REAL,
                        evidence_type TEXT,
                        evidence_data TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

        this.db.run(`
                    CREATE TABLE IF NOT EXISTS consensus_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT,
                        template_id TEXT,
                        mode TEXT,
                        final_score REAL,
                        consensus_achieved BOOLEAN,
                        retry_count INTEGER,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

        this.db.run(`
                    CREATE TABLE IF NOT EXISTS validator_scores (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT,
                        validator_id TEXT,
                        score REAL,
                        validation_time INTEGER,
                        errors TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

        resolve();
      });
    });
  }

  async validate(template, templateId = null) {
    const sessionId = this.generateSessionId();
    let retryCount = 0;
    let consensusAchieved = false;
    let finalScore = 0;

    while (retryCount < this.maxRetries && !consensusAchieved) {
      try {
        // Spawn validators in parallel
        const validators = this.spawnValidators(
          this.validatorCount,
          template,
          sessionId
        );
        const results = await Promise.all(validators);

        // Calculate consensus
        const consensusResult = await this.calculateConsensus(
          results,
          sessionId
        );
        consensusAchieved = consensusResult.consensusAchieved;
        finalScore = consensusResult.averageScore;

        if (consensusAchieved) {
          await this.recordConsensusSession(
            sessionId,
            templateId,
            finalScore,
            true,
            retryCount
          );
        } else {
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount)
          ); // Exponential backoff
        }
      } catch (error) {
        retryCount++;
        console.error(
          `Validation attempt ${retryCount} failed:`,
          error.message
        );
      }
    }

    if (!consensusAchieved) {
      await this.recordConsensusSession(
        sessionId,
        templateId,
        finalScore,
        false,
        retryCount
      );
      throw new Error(
        `Consensus not achieved after ${this.maxRetries} attempts`
      );
    }

    return {
      sessionId,
      score: finalScore,
      consensusThreshold: this.consensusThreshold,
      mode: this.mode,
      achievedConsensus: true,
    };
  }

  spawnValidators(count, template, sessionId) {
    const validators = [];

    for (let i = 0; i < count; i++) {
      const validatorId = `validator_${i}_${Date.now()}`;
      validators.push(this.runValidator(validatorId, template, sessionId));
    }

    return validators;
  }

  async runValidator(validatorId, template, sessionId) {
    const startTime = Date.now();

    try {
      // Simulate different validation strategies
      const validationStrategies = [
        this.detectLoopsBasic,
        this.detectLoopsAdvanced,
        this.detectLoopsDeepAnalysis,
      ];

      const strategy =
        validationStrategies[
          Math.floor(Math.random() * validationStrategies.length)
        ];
      const score = await strategy.call(this, template);
      const validationTime = Date.now() - startTime;

      // Store validator result
      await this.storeValidatorScore(
        sessionId,
        validatorId,
        score,
        validationTime,
        null
      );

      // Store evidence
      await this.storeEvidence(
        sessionId,
        validatorId,
        'validation_score',
        JSON.stringify({
          score,
          validationTime,
          strategy: strategy.name,
        })
      );

      return {
        validatorId,
        score,
        validationTime,
        sessionId,
      };
    } catch (error) {
      const validationTime = Date.now() - startTime;
      await this.storeValidatorScore(
        sessionId,
        validatorId,
        0,
        validationTime,
        error.message
      );
      throw error;
    }
  }

  detectLoopsBasic(template) {
    // Basic loop detection - simplified for demonstration
    const resources = template.Resources || {};
    const hasLoops = Object.keys(resources).length > 10; // Simplified logic
    return hasLoops ? Math.random() * 0.3 + 0.6 : Math.random() * 0.2 + 0.8;
  }

  detectLoopsAdvanced(template) {
    // Advanced loop detection
    const resources = template.Resources || {};
    const conditions = template.Conditions || {};

    let loopScore = 0.5;

    // Check for circular references
    const resourceNames = Object.keys(resources);
    for (let i = 0; i < resourceNames.length; i++) {
      for (let j = i + 1; j < resourceNames.length; j++) {
        if (
          this.hasCircularDependency(
            resources[resourceNames[i]],
            resources[resourceNames[j]]
          )
        ) {
          loopScore += 0.1;
        }
      }
    }

    return Math.min(loopScore, 1.0);
  }

  detectLoopsDeepAnalysis(template) {
    // Deep analysis with comprehensive checks
    const resources = template.Resources || {};
    const conditions = template.Conditions || {};
    const outputs = template.Outputs || {};

    let score = 0.5;

    // Analyze resource dependencies
    score += this.analyzeResourceDependencies(resources) * 0.3;

    // Check condition loops
    score += this.analyzeConditionLoops(conditions) * 0.2;

    // Check output dependencies
    score += this.analyzeOutputDependencies(outputs, resources) * 0.2;

    // Check intrinsic function complexity
    score += this.analyzeIntrinsicFunctions(template) * 0.3;

    return Math.min(score, 1.0);
  }

  hasCircularDependency(resource1, resource2) {
    // Simplified circular dependency check
    return Math.random() > 0.7; // Random for demo
  }

  analyzeResourceDependencies(resources) {
    const resourceNames = Object.keys(resources);
    let complexity = 0;

    resourceNames.forEach((name) => {
      const resource = resources[name];
      const properties = resource.Properties || {};
      const dependsOn = resource.DependsOn || [];

      complexity += dependsOn.length * 0.1;
    });

    return Math.min(complexity / resourceNames.length, 1.0);
  }

  analyzeConditionLoops(conditions) {
    const conditionNames = Object.keys(conditions);
    let loopCount = 0;

    // Check for condition references
    conditionNames.forEach((name) => {
      const condition = conditions[name];
      if (condition && typeof condition === 'object') {
        const fn = condition.Fn || condition.Ref || condition.Condition;
        if (fn && conditionNames.includes(fn)) {
          loopCount++;
        }
      }
    });

    return Math.min(loopCount / conditionNames.length, 1.0);
  }

  analyzeOutputDependencies(outputs, resources) {
    const outputNames = Object.keys(outputs);
    let dependencyCount = 0;

    outputNames.forEach((name) => {
      const output = outputs[name];
      const value = output.Value;
      if (value && typeof value === 'string') {
        // Check if output references resources
        const resourceNames = Object.keys(resources);
        resourceNames.forEach((resourceName) => {
          if (
            value.includes(`!Ref ${resourceName}`) ||
            value.includes(`!GetAtt ${resourceName}`)
          ) {
            dependencyCount++;
          }
        });
      }
    });

    return Math.min(dependencyCount / outputNames.length, 1.0);
  }

  analyzeIntrinsicFunctions(template) {
    const templateString = JSON.stringify(template);
    const intrinsicFunctions = [
      'Fn::If',
      'Fn::Join',
      'Fn::Select',
      'Fn::Split',
      'Fn::FindInMap',
      'Fn::GetAZs',
      'Fn::ImportValue',
      'Fn::GetAtt',
      'Fn::Join',
      'Fn::Select',
      'Fn::Split',
    ];

    let functionCount = 0;
    intrinsicFunctions.forEach((fn) => {
      const regex = new RegExp(`"${fn}"`, 'g');
      const matches = templateString.match(regex);
      if (matches) {
        functionCount += matches.length;
      }
    });

    return Math.min(functionCount / 10, 1.0); // Normalize to 0-1
  }

  async calculateConsensus(results, sessionId) {
    if (results.length === 0) {
      return { consensusAchieved: false, averageScore: 0 };
    }

    const scores = results.map((r) => r.score);
    const averageScore =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const standardDeviation = Math.sqrt(
      scores.reduce(
        (sum, score) => sum + Math.pow(score - averageScore, 2),
        0
      ) / scores.length
    );

    const consensusAchieved =
      averageScore >= this.consensusThreshold && standardDeviation <= 0.1;

    await this.storeEvidence(
      sessionId,
      'consensus_calculator',
      'consensus_result',
      JSON.stringify({
        scores,
        averageScore,
        standardDeviation,
        consensusThreshold: this.consensusThreshold,
        consensusAchieved,
      })
    );

    return { consensusAchieved, averageScore, standardDeviation };
  }

  async storeValidatorScore(
    sessionId,
    validatorId,
    score,
    validationTime,
    errors
  ) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
                INSERT INTO validator_scores (session_id, validator_id, score, validation_time, errors)
                VALUES (?, ?, ?, ?, ?)
            `);

      stmt.run(
        [sessionId, validatorId, score, validationTime, errors],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );

      stmt.finalize();
    });
  }

  async storeEvidence(sessionId, validatorId, evidenceType, evidenceData) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
                INSERT INTO validation_evidence (template_id, validator_id, score, evidence_type, evidence_data)
                VALUES (?, ?, ?, ?, ?)
            `);

      stmt.run(
        [sessionId, validatorId, 0, evidenceType, evidenceData],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );

      stmt.finalize();
    });
  }

  async recordConsensusSession(
    sessionId,
    templateId,
    finalScore,
    consensusAchieved,
    retryCount
  ) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
                INSERT INTO consensus_sessions (session_id, template_id, mode, final_score, consensus_achieved, retry_count)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

      stmt.run(
        [
          sessionId,
          templateId,
          this.mode,
          finalScore,
          consensusAchieved,
          retryCount,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );

      stmt.finalize();
    });
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = CFNLoopValidator;
