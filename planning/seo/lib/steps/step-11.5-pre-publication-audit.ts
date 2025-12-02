/**
 * Step 11.5: Pre-Publication SEO Audit
 * SEO Intelligence Integration - Content Quality Gates
 *
 * @module planning/seo/lib/steps/step-11.5-pre-publication-audit
 * @description Comprehensive pre-publication audit with scoring and recommendations
 * @version 1.0.0
 */

import {
  Step115Config,
  Step115Result,
  AuditScore,
  AuditFinding,
  AuditSeverity,
  TitleTagAudit,
  MetaDescriptionAudit,
  SchemaMarkupAudit,
  InternalLinkingAudit,
  ReadabilityAudit,
  FreshnessAudit,
  ImageAltAudit,
  DEFAULT_CATEGORY_WEIGHTS,
  POWER_WORDS,
  EMOTIONAL_TRIGGERS,
  CTA_PHRASES,
  RECOMMENDED_SCHEMAS,
  isValidStep115Config,
} from '../../types/pre-publication-audit';

/**
 * Execute Step 11.5: Pre-Publication SEO Audit
 *
 * @param config - Audit configuration
 * @returns Comprehensive audit result
 */
export async function executeStep115(config: Step115Config): Promise<Step115Result> {
  const startTime = Date.now();

  // Validate configuration
  if (!isValidStep115Config(config)) {
    return {
      success: false,
      overallScore: 0,
      passed: false,
      categoryScores: [],
      allFindings: [],
      criticalFindings: [],
      details: {} as any,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: 'Invalid configuration provided',
    };
  }

  const {
    targetKeyword,
    contentHtml,
    titleTag,
    metaDescription,
    contentType = 'article',
    minAcceptableScore = 75,
    verbose = false,
  } = config;

  if (verbose) {
    console.log('='.repeat(80));
    console.log('Step 11.5: Pre-Publication SEO Audit');
    console.log('='.repeat(80));
    console.log(`Target Keyword: ${targetKeyword}`);
    console.log(`Content Type: ${contentType}`);
    console.log(`Min Acceptable Score: ${minAcceptableScore}`);
    console.log('='.repeat(80));
  }

  try {
    // Execute all audits
    const titleAudit = auditTitleTag(titleTag, targetKeyword);
    const metaAudit = auditMetaDescription(metaDescription, targetKeyword);
    const schemaAudit = auditSchemaMarkup(contentHtml, contentType);
    const linksAudit = auditInternalLinking(contentHtml);
    const readabilityAudit = auditReadability(contentHtml);
    const freshnessAudit = auditFreshnessSignals(contentHtml);
    const imagesAudit = auditImageAltText(contentHtml, targetKeyword);

    // Build category scores
    const categoryScores: AuditScore[] = [
      buildCategoryScore('title', titleAudit.score, titleAudit.findings),
      buildCategoryScore('meta', metaAudit.score, metaAudit.findings),
      buildCategoryScore('schema', schemaAudit.score, schemaAudit.findings),
      buildCategoryScore('links', linksAudit.score, linksAudit.findings),
      buildCategoryScore('readability', readabilityAudit.score, readabilityAudit.findings),
      buildCategoryScore('freshness', freshnessAudit.score, freshnessAudit.findings),
      buildCategoryScore('images', imagesAudit.score, imagesAudit.findings),
    ];

    // Calculate overall score
    const overallScore = calculateOverallScore(categoryScores);

    // Collect all findings
    const allFindings = categoryScores.flatMap((cs) => cs.findings);
    const criticalFindings = allFindings.filter((f) => f.severity === 'critical');

    // Determine pass/fail
    const passed = overallScore >= minAcceptableScore;

    if (verbose) {
      console.log('\nAudit Results:');
      console.log(`Overall Score: ${overallScore.toFixed(1)}/100`);
      console.log(`Status: ${passed ? 'PASSED' : 'FAILED'}`);
      console.log(`Critical Findings: ${criticalFindings.length}`);
      console.log('\nCategory Scores:');
      categoryScores.forEach((cs) => {
        console.log(`  ${cs.category}: ${cs.score.toFixed(1)}/100 (weight: ${cs.weight})`);
      });
      console.log('='.repeat(80));
    }

    return {
      success: true,
      overallScore,
      passed,
      categoryScores,
      allFindings,
      criticalFindings,
      details: {
        title: titleAudit.details,
        meta: metaAudit.details,
        schema: schemaAudit.details,
        links: linksAudit.details,
        readability: readabilityAudit.details,
        freshness: freshnessAudit.details,
        images: imagesAudit.details,
      },
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (verbose) {
      console.error('Audit execution failed:', errorMessage);
    }
    return {
      success: false,
      overallScore: 0,
      passed: false,
      categoryScores: [],
      allFindings: [],
      criticalFindings: [],
      details: {} as any,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Audit title tag for CTR optimization
 */
function auditTitleTag(
  title: string,
  keyword: string
): { score: number; findings: AuditFinding[]; details: TitleTagAudit } {
  const findings: AuditFinding[] = [];
  const length = title.length;

  // Check length (optimal: 50-60)
  const hasOptimalLength = length >= 50 && length <= 60;
  if (!hasOptimalLength) {
    findings.push({
      category: 'title',
      severity: length < 40 || length > 70 ? 'high' : 'medium',
      message: `Title length is ${length} characters (optimal: 50-60)`,
      recommendation:
        length < 50
          ? 'Add more descriptive words to reach optimal length'
          : 'Reduce title length to avoid truncation in SERPs',
      impact: 7,
      currentValue: `${length} characters`,
      suggestedValue: '50-60 characters',
    });
  }

  // Check for target keyword
  const hasKeyword = title.toLowerCase().includes(keyword.toLowerCase());
  if (!hasKeyword) {
    findings.push({
      category: 'title',
      severity: 'critical',
      message: 'Target keyword not found in title',
      recommendation: `Include "${keyword}" naturally in the title`,
      impact: 10,
    });
  }

  // Check for power words
  const powerWord = POWER_WORDS.find((pw) => title.toLowerCase().includes(pw.toLowerCase()));
  const hasPowerWord = !!powerWord;
  if (!hasPowerWord) {
    findings.push({
      category: 'title',
      severity: 'medium',
      message: 'No power word detected in title',
      recommendation: `Consider adding words like: ${POWER_WORDS.slice(0, 5).join(', ')}`,
      impact: 6,
    });
  }

  // Check for numbers
  const numberMatch = title.match(/\d+/);
  const hasNumber = !!numberMatch;
  if (!hasNumber) {
    findings.push({
      category: 'title',
      severity: 'low',
      message: 'No number found in title',
      recommendation: 'Consider adding a number (e.g., "7 Best", "Top 10")',
      impact: 5,
    });
  }

  // Check for current year [2025]
  const hasCurrentYear = title.includes('2025');
  if (!hasCurrentYear) {
    findings.push({
      category: 'title',
      severity: 'medium',
      message: 'Title does not include current year [2025]',
      recommendation: 'Add [2025] to signal freshness',
      impact: 6,
    });
  }

  // Check for visual separators
  const hasVisualSeparator = /[|\-–—:()]/.test(title);
  if (!hasVisualSeparator) {
    findings.push({
      category: 'title',
      severity: 'low',
      message: 'No visual separators (|, -, :) in title',
      recommendation: 'Add separators for better visual distinction in SERPs',
      impact: 4,
    });
  }

  // Check for emotional triggers
  const emotionalTrigger = EMOTIONAL_TRIGGERS.find((et) =>
    title.toLowerCase().includes(et.toLowerCase())
  );
  const hasEmotionalTrigger = !!emotionalTrigger;
  if (!hasEmotionalTrigger) {
    findings.push({
      category: 'title',
      severity: 'low',
      message: 'No emotional trigger detected',
      recommendation: `Consider adding: ${EMOTIONAL_TRIGGERS.slice(0, 5).join(', ')}`,
      impact: 5,
    });
  }

  // Calculate CTR score (0-100)
  let ctrScore = 0;
  if (hasOptimalLength) ctrScore += 20;
  if (hasKeyword) ctrScore += 25;
  if (hasPowerWord) ctrScore += 15;
  if (hasNumber) ctrScore += 15;
  if (hasCurrentYear) ctrScore += 10;
  if (hasVisualSeparator) ctrScore += 10;
  if (hasEmotionalTrigger) ctrScore += 5;

  return {
    score: ctrScore,
    findings,
    details: {
      title,
      length,
      hasKeyword,
      hasPowerWord,
      powerWord,
      hasNumber,
      number: numberMatch?.[0],
      hasCurrentYear,
      hasVisualSeparator,
      hasEmotionalTrigger,
      emotionalTrigger,
      ctrScore,
    },
  };
}

/**
 * Audit meta description for CTR optimization
 */
function auditMetaDescription(
  description: string,
  keyword: string
): { score: number; findings: AuditFinding[]; details: MetaDescriptionAudit } {
  const findings: AuditFinding[] = [];
  const length = description.length;

  // Check length (optimal: 150-160)
  const isOptimalLength = length >= 150 && length <= 160;
  if (!isOptimalLength) {
    findings.push({
      category: 'meta',
      severity: length < 120 || length > 180 ? 'high' : 'medium',
      message: `Meta description is ${length} characters (optimal: 150-160)`,
      recommendation:
        length < 150
          ? 'Expand description to reach optimal length'
          : 'Reduce length to avoid truncation',
      impact: 7,
      currentValue: `${length} characters`,
      suggestedValue: '150-160 characters',
    });
  }

  // Check for target keyword
  const hasKeyword = description.toLowerCase().includes(keyword.toLowerCase());
  if (!hasKeyword) {
    findings.push({
      category: 'meta',
      severity: 'high',
      message: 'Target keyword not found in meta description',
      recommendation: `Include "${keyword}" naturally in the description`,
      impact: 8,
    });
  }

  // Check for CTA
  const cta = CTA_PHRASES.find((phrase) => description.toLowerCase().includes(phrase.toLowerCase()));
  const hasCTA = !!cta;
  if (!hasCTA) {
    findings.push({
      category: 'meta',
      severity: 'medium',
      message: 'No call-to-action in meta description',
      recommendation: `Add CTA like: ${CTA_PHRASES.slice(0, 5).join(', ')}`,
      impact: 7,
    });
  }

  // Check for emotional triggers
  const emotionalTrigger = EMOTIONAL_TRIGGERS.find((et) =>
    description.toLowerCase().includes(et.toLowerCase())
  );
  const hasEmotionalTrigger = !!emotionalTrigger;
  if (!hasEmotionalTrigger) {
    findings.push({
      category: 'meta',
      severity: 'low',
      message: 'No emotional trigger in meta description',
      recommendation: `Consider adding: ${EMOTIONAL_TRIGGERS.slice(0, 5).join(', ')}`,
      impact: 5,
    });
  }

  // Calculate CTR score (0-100)
  let ctrScore = 0;
  if (isOptimalLength) ctrScore += 30;
  if (hasKeyword) ctrScore += 35;
  if (hasCTA) ctrScore += 25;
  if (hasEmotionalTrigger) ctrScore += 10;

  return {
    score: ctrScore,
    findings,
    details: {
      description,
      length,
      hasKeyword,
      hasCTA,
      cta,
      hasEmotionalTrigger,
      emotionalTrigger,
      isOptimalLength,
      ctrScore,
    },
  };
}

/**
 * Audit schema markup coverage
 */
function auditSchemaMarkup(
  html: string,
  contentType: string
): { score: number; findings: AuditFinding[]; details: SchemaMarkupAudit } {
  const findings: AuditFinding[] = [];

  // Detect existing schemas
  const detectedSchemas: string[] = [];
  const schemaMatches = Array.from(html.matchAll(/"@type":\s*"([^"]+)"/g));
  for (const match of schemaMatches) {
    detectedSchemas.push(match[1]);
  }

  // Get recommended schemas for content type
  const recommendedSchemas = RECOMMENDED_SCHEMAS[contentType] || RECOMMENDED_SCHEMAS['article'];

  // Find missing schemas
  const missingSchemas = recommendedSchemas.filter((rs) => !detectedSchemas.includes(rs));

  // Generate findings for missing schemas
  if (missingSchemas.length > 0) {
    findings.push({
      category: 'schema',
      severity: missingSchemas.length > 2 ? 'high' : 'medium',
      message: `Missing ${missingSchemas.length} recommended schema types`,
      recommendation: `Add schema markup for: ${missingSchemas.join(', ')}`,
      impact: 8,
      currentValue: detectedSchemas.join(', ') || 'None',
      suggestedValue: recommendedSchemas.join(', '),
    });
  }

  // Calculate coverage score
  const coverageScore = recommendedSchemas.length > 0
    ? Math.round((detectedSchemas.length / recommendedSchemas.length) * 100)
    : 0;

  return {
    score: coverageScore,
    findings,
    details: {
      detectedSchemas,
      missingSchemas,
      coverageScore,
      contentType,
    },
  };
}

/**
 * Audit internal linking
 */
function auditInternalLinking(
  html: string
): { score: number; findings: AuditFinding[]; details: InternalLinkingAudit } {
  const findings: AuditFinding[] = [];

  // Extract all links
  const linkMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi);
  const links = Array.from(linkMatches);

  // Count internal links (relative URLs or same domain)
  const internalLinks = links.filter(
    ([, href]) => href.startsWith('/') || !href.startsWith('http')
  );
  const totalLinks = internalLinks.length;

  // Count contextual links (in body, not nav/footer)
  const bodyMatches = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatches?.[1] || html;
  const contextualLinks = bodyHtml.match(/<a[^>]+href=/gi)?.length || 0;

  // Check if count is optimal (3-5)
  const isOptimalCount = totalLinks >= 3 && totalLinks <= 5;
  if (!isOptimalCount) {
    findings.push({
      category: 'links',
      severity: totalLinks === 0 ? 'critical' : 'medium',
      message: `Found ${totalLinks} internal links (optimal: 3-5)`,
      recommendation:
        totalLinks < 3
          ? 'Add more contextual internal links to related content'
          : 'Consider reducing excessive internal links',
      impact: totalLinks === 0 ? 9 : 6,
      currentValue: `${totalLinks} links`,
      suggestedValue: '3-5 contextual links',
    });
  }

  // Check for descriptive anchors (non-generic)
  const genericAnchors = ['click here', 'read more', 'here', 'this', 'link'];
  const descriptiveAnchors = internalLinks.filter(([, , text]) => {
    const anchorText = text.toLowerCase();
    return !genericAnchors.some((ga) => anchorText === ga) && anchorText.split(' ').length > 2;
  }).length;

  if (descriptiveAnchors < totalLinks * 0.8) {
    findings.push({
      category: 'links',
      severity: 'medium',
      message: 'Too many generic anchor texts detected',
      recommendation: 'Use descriptive anchor text that includes keywords',
      impact: 6,
    });
  }

  // Calculate quality score
  let qualityScore = 0;
  if (isOptimalCount) qualityScore += 40;
  if (contextualLinks >= 3) qualityScore += 30;
  if (descriptiveAnchors >= totalLinks * 0.8) qualityScore += 30;

  return {
    score: qualityScore,
    findings,
    details: {
      totalLinks,
      contextualLinks,
      isOptimalCount,
      highAuthorityLinks: 0, // Would require page authority data
      descriptiveAnchors,
      qualityScore,
    },
  };
}

/**
 * Audit readability
 */
function auditReadability(
  html: string
): { score: number; findings: AuditFinding[]; details: ReadabilityAudit } {
  const findings: AuditFinding[] = [];

  // Extract text content
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Calculate sentences
  const sentences = textContent.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Calculate words
  const words = textContent.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Calculate syllables (simplified)
  const syllableCount = words.reduce((count, word) => {
    return count + Math.max(1, word.replace(/[^aeiouAEIOU]/g, '').length);
  }, 0);

  // Flesch Reading Ease: 206.835 - 1.015(words/sentences) - 84.6(syllables/words)
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;
  const fleschScore = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)
  );

  // Check if Flesch score is optimal (60-70)
  const isOptimalFlesch = fleschScore >= 60 && fleschScore <= 70;
  if (!isOptimalFlesch) {
    findings.push({
      category: 'readability',
      severity: fleschScore < 50 ? 'high' : 'medium',
      message: `Flesch Reading Ease is ${fleschScore.toFixed(1)} (optimal: 60-70)`,
      recommendation:
        fleschScore < 60
          ? 'Simplify sentences and reduce complex words'
          : 'Content may be too simple; add more depth',
      impact: 7,
      currentValue: fleschScore.toFixed(1),
      suggestedValue: '60-70',
    });
  }

  // Check average sentence length (optimal: 15-20 words)
  if (avgWordsPerSentence < 15 || avgWordsPerSentence > 20) {
    findings.push({
      category: 'readability',
      severity: 'low',
      message: `Average sentence length is ${avgWordsPerSentence.toFixed(1)} words`,
      recommendation: 'Aim for 15-20 words per sentence',
      impact: 5,
    });
  }

  // Extract paragraphs
  const paragraphs = html.split(/<\/p>/i).filter((p) => p.includes('<p'));
  const paragraphCount = paragraphs.length;

  // Check for walls of text (paragraphs > 150 words)
  const wallOfTextCount = paragraphs.filter((p) => {
    const pWords = p.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => w.length > 0);
    return pWords.length > 150;
  }).length;

  if (wallOfTextCount > 0) {
    findings.push({
      category: 'readability',
      severity: 'medium',
      message: `${wallOfTextCount} paragraph(s) exceed 150 words`,
      recommendation: 'Break long paragraphs into smaller chunks (2-3 sentences)',
      impact: 6,
    });
  }

  // Check transition words (simplified check)
  const transitionWords = [
    'however',
    'therefore',
    'furthermore',
    'additionally',
    'moreover',
    'consequently',
  ];
  const transitionCount = transitionWords.reduce((count, tw) => {
    return count + (textContent.toLowerCase().match(new RegExp(`\\b${tw}\\b`, 'g'))?.length || 0);
  }, 0);
  const transitionWordPercent = sentenceCount > 0 ? (transitionCount / sentenceCount) * 100 : 0;

  if (transitionWordPercent < 20) {
    findings.push({
      category: 'readability',
      severity: 'low',
      message: 'Low usage of transition words',
      recommendation: 'Use more transition words to improve flow',
      impact: 4,
    });
  }

  // Calculate readability score
  let readabilityScore = 0;
  if (isOptimalFlesch) readabilityScore += 40;
  if (avgWordsPerSentence >= 15 && avgWordsPerSentence <= 20) readabilityScore += 20;
  if (wallOfTextCount === 0) readabilityScore += 30;
  if (transitionWordPercent >= 20) readabilityScore += 10;

  return {
    score: readabilityScore,
    findings,
    details: {
      fleschScore,
      avgSentenceLength: avgWordsPerSentence,
      avgParagraphLength: paragraphCount > 0 ? sentenceCount / paragraphCount : 0,
      transitionWordPercent,
      wallOfTextCount,
      isOptimalFlesch,
      readabilityScore,
    },
  };
}

/**
 * Audit freshness signals
 */
function auditFreshnessSignals(
  html: string
): { score: number; findings: AuditFinding[]; details: FreshnessAudit } {
  const findings: AuditFinding[] = [];

  // Check for current year [2025]
  const hasCurrentYear = html.includes('2025');
  if (!hasCurrentYear) {
    findings.push({
      category: 'freshness',
      severity: 'high',
      message: 'Content does not mention current year [2025]',
      recommendation: 'Add [2025] to signal freshness',
      impact: 8,
    });
  }

  // Check for recent years (2023, 2024)
  const yearMatches = html.match(/\b(20\d{2})\b/g);
  const years = yearMatches ? Array.from(new Set(yearMatches.map((y) => parseInt(y)))) : [];
  const mostRecentYear = years.length > 0 ? Math.max(...years) : undefined;
  const hasRecentData = mostRecentYear ? mostRecentYear >= 2023 : false;

  if (!hasRecentData) {
    findings.push({
      category: 'freshness',
      severity: 'medium',
      message: 'No recent data or statistics found',
      recommendation: 'Include data from 2023 or later',
      impact: 6,
    });
  }

  // Check for publication date
  const hasVisibleDate =
    html.includes('Published') ||
    html.includes('published') ||
    html.includes('datetime') ||
    html.includes('datePublished');
  if (!hasVisibleDate) {
    findings.push({
      category: 'freshness',
      severity: 'medium',
      message: 'No visible publication date detected',
      recommendation: 'Add visible publication date to content',
      impact: 5,
    });
  }

  // Check for last updated date
  const hasLastUpdated =
    html.includes('Updated') ||
    html.includes('updated') ||
    html.includes('Last updated') ||
    html.includes('dateModified');
  if (!hasLastUpdated) {
    findings.push({
      category: 'freshness',
      severity: 'low',
      message: 'No "Last Updated" date detected',
      recommendation: 'Add "Last Updated" date for transparency',
      impact: 4,
    });
  }

  // Calculate freshness score
  let freshnessScore = 0;
  if (hasCurrentYear) freshnessScore += 40;
  if (hasRecentData) freshnessScore += 30;
  if (hasVisibleDate) freshnessScore += 20;
  if (hasLastUpdated) freshnessScore += 10;

  return {
    score: freshnessScore,
    findings,
    details: {
      hasCurrentYear,
      hasRecentData,
      mostRecentYear,
      hasVisibleDate,
      hasLastUpdated,
      freshnessScore,
    },
  };
}

/**
 * Audit image ALT text
 */
function auditImageAltText(
  html: string,
  keyword: string
): { score: number; findings: AuditFinding[]; details: ImageAltAudit } {
  const findings: AuditFinding[] = [];

  // Extract all images
  const imageMatches = html.matchAll(/<img[^>]+>/gi);
  const images = Array.from(imageMatches);
  const totalImages = images.length;

  // Count images with ALT text
  const imagesWithAlt = images.filter((img) => /alt\s*=\s*["'][^"']+["']/i.test(img[0])).length;
  const imagesMissingAlt = totalImages - imagesWithAlt;

  // Calculate ALT coverage
  const altCoverage = totalImages > 0 ? (imagesWithAlt / totalImages) * 100 : 100;

  if (imagesMissingAlt > 0) {
    findings.push({
      category: 'images',
      severity: 'high',
      message: `${imagesMissingAlt} image(s) missing ALT text`,
      recommendation: 'Add descriptive ALT text to all images',
      impact: 8,
      currentValue: `${imagesWithAlt}/${totalImages} images with ALT`,
      suggestedValue: 'All images should have ALT text',
    });
  }

  // Count ALT texts with keyword
  const altWithKeyword = images.filter((img) => {
    const altMatch = img[0].match(/alt\s*=\s*["']([^"']+)["']/i);
    return altMatch && altMatch[1].toLowerCase().includes(keyword.toLowerCase());
  }).length;

  if (altWithKeyword === 0 && totalImages > 0) {
    findings.push({
      category: 'images',
      severity: 'medium',
      message: 'No image ALT text contains target keyword',
      recommendation: `Include "${keyword}" in at least one image ALT text`,
      impact: 6,
    });
  }

  // Count descriptive ALT texts (>5 words)
  const descriptiveAltCount = images.filter((img) => {
    const altMatch = img[0].match(/alt\s*=\s*["']([^"']+)["']/i);
    return altMatch && altMatch[1].split(' ').length > 5;
  }).length;

  if (descriptiveAltCount < imagesWithAlt * 0.7) {
    findings.push({
      category: 'images',
      severity: 'low',
      message: 'Many ALT texts are too short or generic',
      recommendation: 'Use descriptive ALT text (>5 words)',
      impact: 4,
    });
  }

  // Calculate quality score
  let altQualityScore = 0;
  if (altCoverage === 100) altQualityScore += 50;
  else if (altCoverage >= 80) altQualityScore += 30;
  if (altWithKeyword > 0) altQualityScore += 25;
  if (descriptiveAltCount >= imagesWithAlt * 0.7) altQualityScore += 25;

  return {
    score: altQualityScore,
    findings,
    details: {
      totalImages,
      imagesWithAlt,
      imagesMissingAlt,
      altWithKeyword,
      descriptiveAltCount,
      altCoverage,
      altQualityScore,
    },
  };
}

/**
 * Build category score with weighted contribution
 */
function buildCategoryScore(
  category: string,
  score: number,
  findings: AuditFinding[]
): AuditScore {
  const weight = DEFAULT_CATEGORY_WEIGHTS[category as keyof typeof DEFAULT_CATEGORY_WEIGHTS];
  return {
    category: category as any,
    score,
    weight,
    findings,
    weightedScore: score * weight,
  };
}

/**
 * Calculate overall score from category scores
 */
function calculateOverallScore(categoryScores: AuditScore[]): number {
  const totalWeightedScore = categoryScores.reduce((sum, cs) => sum + cs.weightedScore, 0);
  return Math.round(totalWeightedScore * 10) / 10; // Round to 1 decimal
}
