const fs = require('fs');
const path = require('path');

describe('Security Review Validation', () => {
  const securityReviewPath = path.resolve(__dirname, '../planning/portal-improvements/phase-1/security-review.md');

  test('Security review file exists', () => {
    expect(fs.existsSync(securityReviewPath)).toBe(true);
  });

  test('Security review contains required sections', () => {
    const content = fs.readFileSync(securityReviewPath, 'utf-8');

    const requiredSections = [
      'Executive Summary',
      'Critical Issues',
      'High-Priority Issues',
      'Conclusion'
    ];

    requiredSections.forEach(section => {
      expect(content).toMatch(new RegExp(`## ${section}`));
    });
  });

  test('Confidence score in expected range', () => {
    const content = fs.readFileSync(securityReviewPath, 'utf-8');
    const confidenceMatch = content.match(/\*\*Overall Confidence:\*\* (\d+\.\d+)/);

    expect(confidenceMatch).toBeTruthy();
    const confidence = parseFloat(confidenceMatch[1]);

    expect(confidence).toBeGreaterThanOrEqual(0.75);
    expect(confidence).toBeLessThanOrEqual(0.90);
  });

  test('Security recommendations are present', () => {
    const content = fs.readFileSync(securityReviewPath, 'utf-8');

    const criticalIssues = content.match(/### \d+\./g);
    const additionalRecommendations = content.match(/## Additional Recommendations/);

    expect(criticalIssues).toBeTruthy();
    expect(criticalIssues.length).toBeGreaterThan(2);

    expect(additionalRecommendations).toBeTruthy();
  });
});