/**
 * SERP Feature Optimizer Implementation
 *
 * @module planning/seo/lib/serp-feature-optimizer
 * @description Implementation for SERP feature optimization and schema markup generation
 * @version 1.0.0
 *
 * Provides functions for:
 * - Detecting SERP feature opportunities
 * - Formatting content for featured snippets, PAA, video carousels, etc.
 * - Generating schema markup (JSON-LD)
 * - Validating schema against Google's requirements
 */

import { Redis } from 'ioredis';
import { SERPFeatureType, FeaturedSnippetType } from '../../../packages/seo-analysis/src/types/serp-analysis';
import {
  SERPFeatureOpportunity,
  OpportunityDetectionConfig,
  FeaturedSnippetConfig,
  PAAConfig,
  VideoCarouselConfig,
  ImagePackConfig,
  HowToConfig,
  TableSnippetConfig,
  OptimizationResult,
  BatchOptimizationResult,
  FAQPageSchema,
  HowToSchema,
  VideoObjectSchema,
  ArticleSchema,
  SchemaValidationResult,
  SERPOptimizationError,
  SERPOptimizationErrorCode,
  CACHE_KEYS,
  CACHE_TTL,
  SchemaType,
} from '../types/serp-optimization';

// ============================================================================
// OPPORTUNITY DETECTION
// ============================================================================

/**
 * Detect SERP feature opportunities in content
 */
export async function detectSERPOpportunities(
  config: OpportunityDetectionConfig
): Promise<SERPFeatureOpportunity[]> {
  const opportunities: SERPFeatureOpportunity[] = [];

  // Check for featured snippet opportunity
  const snippetOpp = detectFeaturedSnippetOpportunity(config);
  if (snippetOpp) opportunities.push(snippetOpp);

  // Check for PAA opportunity
  const paaOpp = detectPAAOpportunity(config);
  if (paaOpp) opportunities.push(paaOpp);

  // Check for video carousel opportunity
  const videoOpp = detectVideoOpportunity(config);
  if (videoOpp) opportunities.push(videoOpp);

  // Check for image pack opportunity
  const imageOpp = detectImagePackOpportunity(config);
  if (imageOpp) opportunities.push(imageOpp);

  // Check for HowTo opportunity
  const howToOpp = detectHowToOpportunity(config);
  if (howToOpp) opportunities.push(howToOpp);

  // Sort by confidence and impact
  return opportunities.sort((a, b) => {
    if (a.impact === b.impact) return b.confidence - a.confidence;
    const impactWeight = { high: 3, medium: 2, low: 1 };
    return impactWeight[b.impact] - impactWeight[a.impact];
  });
}

/**
 * Detect featured snippet opportunity
 */
function detectFeaturedSnippetOpportunity(
  config: OpportunityDetectionConfig
): SERPFeatureOpportunity | null {
  const { content, keyword, currentPosition } = config;

  // Check if content has question-answer structure
  const hasQuestions = /\b(what|how|why|when|where|who)\s+(?:is|are|do|does|can)\b/i.test(content);
  if (!hasQuestions) return null;

  // Calculate confidence based on factors
  let confidence = 0.6;
  if (currentPosition && currentPosition <= 10) confidence += 0.2;
  if (content.length >= 300) confidence += 0.1;
  if (/^#{1,3}\s+.+\?$/m.test(content)) confidence += 0.1; // Has question headings

  return {
    type: SERPFeatureType.FEATURED_SNIPPET,
    snippetType: FeaturedSnippetType.PARAGRAPH,
    confidence,
    targetQuery: keyword,
    currentStatus: 'eligible',
    recommendedPlacement: 'top',
    recommendation:
      'Add a concise 40-60 word answer paragraph immediately after a question heading. Place within first 500 words.',
    impact: 'high',
    requiredSchema: ['Article'],
  };
}

/**
 * Detect PAA opportunity
 */
function detectPAAOpportunity(config: OpportunityDetectionConfig): SERPFeatureOpportunity | null {
  const { content, keyword, serpFeatures } = config;

  // Check if PAA is present in SERP
  const hasPAA = serpFeatures?.includes(SERPFeatureType.PEOPLE_ALSO_ASK);
  if (!hasPAA) return null;

  // Check if content has FAQ structure
  const hasFAQ = /FAQ|frequently asked questions|common questions/i.test(content);
  const hasQA = (content.match(/\?/g) || []).length >= 3;

  let confidence = 0.7;
  if (hasFAQ) confidence += 0.15;
  if (hasQA) confidence += 0.15;

  return {
    type: SERPFeatureType.PEOPLE_ALSO_ASK,
    confidence,
    targetQuery: keyword,
    currentStatus: 'eligible',
    recommendedPlacement: 'middle',
    recommendation:
      'Create an FAQ section with 5-10 questions matching natural language PAA patterns. Implement FAQ schema markup.',
    impact: 'high',
    requiredSchema: ['FAQPage'],
  };
}

/**
 * Detect video carousel opportunity
 */
function detectVideoOpportunity(config: OpportunityDetectionConfig): SERPFeatureOpportunity | null {
  const { content, keyword, serpFeatures } = config;

  // Check if video carousel is present in SERP
  const hasVideo = serpFeatures?.includes(SERPFeatureType.VIDEO_CAROUSEL);
  if (!hasVideo) return null;

  // Check if content mentions video or has embed
  const hasVideoEmbed = /<iframe[^>]+youtube|vimeo/i.test(content);
  const mentionsVideo = /video|watch|tutorial|guide/i.test(content);

  let confidence = 0.5;
  if (hasVideoEmbed) confidence += 0.3;
  if (mentionsVideo) confidence += 0.1;

  return {
    type: SERPFeatureType.VIDEO_CAROUSEL,
    confidence,
    targetQuery: keyword,
    currentStatus: hasVideoEmbed ? 'eligible' : 'not_present',
    recommendedPlacement: 'top',
    recommendation:
      'Add a high-quality video with VideoObject schema markup. Include thumbnail, transcript, and timestamps.',
    impact: 'medium',
    requiredSchema: ['VideoObject'],
  };
}

/**
 * Detect image pack opportunity
 */
function detectImagePackOpportunity(
  config: OpportunityDetectionConfig
): SERPFeatureOpportunity | null {
  const { content, serpFeatures } = config;

  // Check if image pack is present in SERP
  const hasImagePack = serpFeatures?.includes(SERPFeatureType.IMAGE_PACK);
  if (!hasImagePack) return null;

  // Check if content has images
  const imageCount = (content.match(/<img/g) || []).length;
  const hasAltText = /alt="[^"]+"/i.test(content);

  let confidence = 0.6;
  if (imageCount >= 3) confidence += 0.2;
  if (hasAltText) confidence += 0.1;

  return {
    type: SERPFeatureType.IMAGE_PACK,
    confidence,
    targetQuery: config.keyword,
    currentStatus: imageCount >= 3 ? 'eligible' : 'not_present',
    recommendedPlacement: 'middle',
    recommendation:
      'Add 3-5 high-resolution images (1200px+ width) with keyword-rich alt text and descriptive file names.',
    impact: 'medium',
  };
}

/**
 * Detect HowTo opportunity
 */
function detectHowToOpportunity(config: OpportunityDetectionConfig): SERPFeatureOpportunity | null {
  const { content, keyword } = config;

  // Check if keyword suggests how-to intent
  const isHowTo = /\bhow\s+to\b/i.test(keyword);
  if (!isHowTo) return null;

  // Check if content has step-by-step structure
  const hasSteps = /step\s+\d+|^\d+\.|^\d+\s/im.test(content);
  const hasOrderedList = /<ol>/i.test(content);

  let confidence = 0.7;
  if (hasSteps || hasOrderedList) confidence += 0.2;

  return {
    type: SERPFeatureType.RELATED_SEARCHES, // Using RELATED_SEARCHES as proxy since HowTo isn't in enum
    confidence,
    targetQuery: keyword,
    currentStatus: hasSteps || hasOrderedList ? 'eligible' : 'not_present',
    recommendedPlacement: 'top',
    recommendation:
      'Format content as numbered steps (minimum 3-5 steps). Implement HowTo schema markup with step names and instructions.',
    impact: 'high',
    requiredSchema: ['HowTo'],
  };
}

// ============================================================================
// CONTENT FORMATTING
// ============================================================================

/**
 * Format content for featured snippet (paragraph)
 */
export function formatForFeaturedSnippet(config: FeaturedSnippetConfig): string {
  const { question, sourceContent, targetLength = 50 } = config;

  // Extract or generate answer from source content
  const answer = extractAnswer(sourceContent, question, targetLength);

  // Format as question + answer
  return `## ${question}\n\n${answer}`;
}

/**
 * Format content for PAA (FAQ section)
 */
export function formatForPAA(config: PAAConfig): string {
  const { questions, answers, useExpandable = false } = config;

  if (questions.length !== answers.length) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.INVALID_CONTENT,
      'Questions and answers arrays must have the same length'
    );
  }

  let html = '## Frequently Asked Questions\n\n';

  questions.forEach((question, index) => {
    if (useExpandable) {
      html += `<details>\n`;
      html += `  <summary><strong>${question}</strong></summary>\n`;
      html += `  <p>${answers[index]}</p>\n`;
      html += `</details>\n\n`;
    } else {
      html += `### ${question}\n\n`;
      html += `${answers[index]}\n\n`;
    }
  });

  return html;
}

/**
 * Format content for video carousel
 */
export function formatForVideoCarousel(config: VideoCarouselConfig): string {
  const { title, embedUrl } = config;

  if (!embedUrl) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.MISSING_REQUIRED_FIELD,
      'embedUrl is required for video carousel formatting'
    );
  }

  return `## ${title}\n\n<iframe src="${embedUrl}" width="560" height="315" frameborder="0" allowfullscreen></iframe>`;
}

/**
 * Format recommendations for image pack
 */
export function formatForImagePack(config: ImagePackConfig): {
  optimizedAlt: string;
  optimizedFileName: string;
  recommendations: string[];
} {
  const { src, currentAlt, context, keyword, fileName } = config;

  // Generate optimized alt text
  const optimizedAlt = generateImageAlt(keyword, context);

  // Generate optimized file name
  const optimizedFileName = generateImageFileName(keyword, fileName);

  // Generate recommendations
  const recommendations: string[] = [];

  if (currentAlt && currentAlt.length < 10) {
    recommendations.push('Current alt text is too short. Use descriptive, keyword-rich alt text.');
  }

  if (fileName && /image\d+|img\d+|photo\d+/i.test(fileName)) {
    recommendations.push('Use descriptive file names with hyphens instead of generic names.');
  }

  recommendations.push('Ensure image is at least 1200px wide for featured image placement.');
  recommendations.push('Use WebP or modern format for faster loading.');

  return {
    optimizedAlt,
    optimizedFileName,
    recommendations,
  };
}

/**
 * Format content for HowTo
 */
export function formatForHowTo(config: HowToConfig): string {
  const { title, description, steps } = config;

  if (steps.length < 2) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.INVALID_CONTENT,
      'HowTo must have at least 2 steps'
    );
  }

  let html = `## ${title}\n\n`;
  html += `${description}\n\n`;

  steps.forEach((step, index) => {
    html += `### Step ${index + 1}: ${step.name}\n\n`;
    html += `${step.text}\n\n`;
    if (step.image) {
      html += `![${step.name}](${step.image})\n\n`;
    }
    if (step.tip) {
      html += `**Tip:** ${step.tip}\n\n`;
    }
  });

  return html;
}

/**
 * Format content for table snippet
 */
export function formatForTableSnippet(config: TableSnippetConfig): string {
  const { caption, headers, rows } = config;

  let html = `<table>\n`;
  if (caption) html += `  <caption>${caption}</caption>\n`;

  // Headers
  html += `  <thead>\n    <tr>\n`;
  headers.forEach((header) => {
    html += `      <th>${header}</th>\n`;
  });
  html += `    </tr>\n  </thead>\n`;

  // Rows
  html += `  <tbody>\n`;
  rows.forEach((row) => {
    html += `    <tr>\n`;
    row.forEach((cell, cellIndex) => {
      const tag = cellIndex === 0 ? 'th' : 'td';
      html += `      <${tag}>${cell}</${tag}>\n`;
    });
    html += `    </tr>\n`;
  });
  html += `  </tbody>\n</table>`;

  return html;
}

// ============================================================================
// SCHEMA MARKUP GENERATION
// ============================================================================

/**
 * Generate FAQ schema markup
 */
export function generateFAQSchema(config: PAAConfig): FAQPageSchema {
  const { questions, answers } = config;

  if (questions.length !== answers.length) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.INVALID_CONTENT,
      'Questions and answers arrays must have the same length'
    );
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((question, index) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answers[index],
      },
    })),
  };
}

/**
 * Generate HowTo schema markup
 */
export function generateHowToSchema(config: HowToConfig): HowToSchema {
  const { title, description, steps, totalTime, tools, supplies } = config;

  if (steps.length < 2) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.INVALID_CONTENT,
      'HowTo must have at least 2 steps'
    );
  }

  const schema: HowToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: title,
    description,
    step: steps.map((step) => ({
      '@type': 'HowToStep',
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
      ...(step.video && { video: step.video }),
    })),
  };

  if (totalTime) schema.totalTime = totalTime;
  if (tools && tools.length > 0) schema.tool = tools;
  if (supplies && supplies.length > 0) schema.supply = supplies;

  return schema;
}

/**
 * Generate VideoObject schema markup
 */
export function generateVideoObjectSchema(config: VideoCarouselConfig): VideoObjectSchema {
  const { title, description, thumbnailUrl, uploadDate, duration, contentUrl, embedUrl, transcript } = config;

  const schema: VideoObjectSchema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description,
    thumbnailUrl,
    uploadDate,
    duration,
  };

  if (contentUrl) schema.contentUrl = contentUrl;
  if (embedUrl) schema.embedUrl = embedUrl;
  if (transcript) schema.transcript = transcript;

  return schema;
}

/**
 * Generate Article schema markup
 */
export function generateArticleSchema(config: {
  headline: string;
  author: string;
  datePublished: string;
  dateModified: string;
  imageUrl: string;
  publisherName: string;
  publisherLogo: string;
}): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: config.headline,
    author: {
      '@type': 'Person',
      name: config.author,
    },
    datePublished: config.datePublished,
    dateModified: config.dateModified,
    image: config.imageUrl,
    publisher: {
      '@type': 'Organization',
      name: config.publisherName,
      logo: {
        '@type': 'ImageObject',
        url: config.publisherLogo,
      },
    },
  };
}

/**
 * Convert schema object to JSON-LD string
 */
export function schemaToJSONLD(schema: object): string {
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

/**
 * Validate schema markup
 */
export function validateSchema(schema: object, schemaType: SchemaType): SchemaValidationResult {
  const errors: any[] = [];
  const warnings: any[] = [];

  // Basic validation
  if (!schema || typeof schema !== 'object') {
    errors.push({
      code: 'INVALID_SCHEMA',
      message: 'Schema must be a valid object',
      path: '$',
      severity: 'error',
    });
  }

  const schemaObj = schema as any;

  // Check @context
  if (schemaObj['@context'] !== 'https://schema.org') {
    errors.push({
      code: 'INVALID_CONTEXT',
      message: '@context must be "https://schema.org"',
      path: '$.@context',
      severity: 'error',
    });
  }

  // Check @type
  if (schemaObj['@type'] !== schemaType) {
    errors.push({
      code: 'INVALID_TYPE',
      message: `@type must be "${schemaType}"`,
      path: '$.@type',
      severity: 'error',
    });
  }

  // Type-specific validation
  switch (schemaType) {
    case 'FAQPage':
      validateFAQPageSchema(schemaObj, errors, warnings);
      break;
    case 'HowTo':
      validateHowToSchema(schemaObj, errors, warnings);
      break;
    case 'VideoObject':
      validateVideoObjectSchema(schemaObj, errors, warnings);
      break;
    case 'Article':
      validateArticleSchema(schemaObj, errors, warnings);
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaType,
    validatedAt: new Date(),
    validatorVersion: '1.0.0',
  };
}

/**
 * Validate FAQPage schema
 */
function validateFAQPageSchema(schema: any, errors: any[], warnings: any[]): void {
  if (!schema.mainEntity || !Array.isArray(schema.mainEntity)) {
    errors.push({
      code: 'MISSING_MAIN_ENTITY',
      message: 'FAQPage must have mainEntity array',
      path: '$.mainEntity',
      severity: 'error',
    });
    return;
  }

  if (schema.mainEntity.length < 2) {
    warnings.push({
      code: 'FEW_QUESTIONS',
      message: 'FAQPage should have at least 2 questions',
      path: '$.mainEntity',
      severity: 'warning',
    });
  }

  schema.mainEntity.forEach((question: any, index: number) => {
    if (!question.name) {
      errors.push({
        code: 'MISSING_QUESTION_NAME',
        message: 'Question must have name property',
        path: `$.mainEntity[${index}].name`,
        severity: 'error',
      });
    }

    if (!question.acceptedAnswer?.text) {
      errors.push({
        code: 'MISSING_ANSWER',
        message: 'Question must have acceptedAnswer.text',
        path: `$.mainEntity[${index}].acceptedAnswer.text`,
        severity: 'error',
      });
    }
  });
}

/**
 * Validate HowTo schema
 */
function validateHowToSchema(schema: any, errors: any[], warnings: any[]): void {
  if (!schema.name) {
    errors.push({
      code: 'MISSING_NAME',
      message: 'HowTo must have name property',
      path: '$.name',
      severity: 'error',
    });
  }

  if (!schema.step || !Array.isArray(schema.step)) {
    errors.push({
      code: 'MISSING_STEPS',
      message: 'HowTo must have step array',
      path: '$.step',
      severity: 'error',
    });
    return;
  }

  if (schema.step.length < 2) {
    errors.push({
      code: 'INSUFFICIENT_STEPS',
      message: 'HowTo must have at least 2 steps',
      path: '$.step',
      severity: 'error',
    });
  }

  schema.step.forEach((step: any, index: number) => {
    if (!step.name) {
      errors.push({
        code: 'MISSING_STEP_NAME',
        message: 'Step must have name property',
        path: `$.step[${index}].name`,
        severity: 'error',
      });
    }

    if (!step.text) {
      errors.push({
        code: 'MISSING_STEP_TEXT',
        message: 'Step must have text property',
        path: `$.step[${index}].text`,
        severity: 'error',
      });
    }
  });
}

/**
 * Validate VideoObject schema
 */
function validateVideoObjectSchema(schema: any, errors: any[], warnings: any[]): void {
  const required = ['name', 'description', 'thumbnailUrl', 'uploadDate'];

  required.forEach((field) => {
    if (!schema[field]) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `VideoObject must have ${field} property`,
        path: `$.${field}`,
        severity: 'error',
      });
    }
  });

  if (!schema.contentUrl && !schema.embedUrl) {
    warnings.push({
      code: 'MISSING_VIDEO_URL',
      message: 'VideoObject should have contentUrl or embedUrl',
      path: '$',
      severity: 'warning',
      improvement: 'Add contentUrl or embedUrl for better indexing',
    });
  }
}

/**
 * Validate Article schema
 */
function validateArticleSchema(schema: any, errors: any[], warnings: any[]): void {
  const required = ['headline', 'author', 'datePublished', 'image', 'publisher'];

  required.forEach((field) => {
    if (!schema[field]) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: `Article must have ${field} property`,
        path: `$.${field}`,
        severity: 'error',
      });
    }
  });

  if (schema.publisher && !schema.publisher.logo) {
    errors.push({
      code: 'MISSING_PUBLISHER_LOGO',
      message: 'Publisher must have logo property',
      path: '$.publisher.logo',
      severity: 'error',
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract answer from content
 */
function extractAnswer(content: string, question: string, targetLength: number): string {
  // Simple extraction: find paragraph after question or first paragraph
  const paragraphs = content.split('\n\n').filter((p) => p.trim().length > 50);

  if (paragraphs.length === 0) {
    throw new SERPOptimizationError(
      SERPOptimizationErrorCode.CONTENT_TOO_SHORT,
      'Content is too short to extract answer'
    );
  }

  // Find paragraph mentioning key terms from question
  const questionTerms = question
    .toLowerCase()
    .replace(/[?.,]/g, '')
    .split(' ')
    .filter((w) => w.length > 3);

  let bestParagraph = paragraphs[0];
  let bestScore = 0;

  paragraphs.forEach((p) => {
    const score = questionTerms.filter((term) => p.toLowerCase().includes(term)).length;
    if (score > bestScore) {
      bestScore = score;
      bestParagraph = p;
    }
  });

  // Trim to target length (words)
  const words = bestParagraph.split(/\s+/);
  if (words.length <= targetLength) return bestParagraph;

  return words.slice(0, targetLength).join(' ') + '...';
}

/**
 * Generate optimized image alt text
 */
function generateImageAlt(keyword: string, context: string): string {
  // Extract relevant context (first sentence or 10 words)
  const contextWords = context.split(/\s+/).slice(0, 10).join(' ');
  return `${keyword} - ${contextWords}`.trim();
}

/**
 * Generate optimized image file name
 */
function generateImageFileName(keyword: string, currentFileName?: string): string {
  const slug = keyword.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (currentFileName) {
    const ext = currentFileName.split('.').pop();
    return `${slug}.${ext}`;
  }

  return `${slug}.jpg`;
}

// ============================================================================
// REDIS CACHING
// ============================================================================

/**
 * Cache optimization result
 */
export async function cacheOptimization(
  redis: Redis,
  contentHash: string,
  featureType: SERPFeatureType,
  result: OptimizationResult
): Promise<void> {
  const key = CACHE_KEYS.OPTIMIZATION(contentHash, featureType);
  await redis.setex(key, CACHE_TTL.OPTIMIZATION, JSON.stringify(result));
}

/**
 * Get cached optimization result
 */
export async function getCachedOptimization(
  redis: Redis,
  contentHash: string,
  featureType: SERPFeatureType
): Promise<OptimizationResult | null> {
  const key = CACHE_KEYS.OPTIMIZATION(contentHash, featureType);
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

/**
 * Cache schema validation result
 */
export async function cacheValidation(
  redis: Redis,
  schemaHash: string,
  result: SchemaValidationResult
): Promise<void> {
  const key = CACHE_KEYS.VALIDATION(schemaHash);
  await redis.setex(key, CACHE_TTL.VALIDATION, JSON.stringify(result));
}

/**
 * Get cached validation result
 */
export async function getCachedValidation(
  redis: Redis,
  schemaHash: string
): Promise<SchemaValidationResult | null> {
  const key = CACHE_KEYS.VALIDATION(schemaHash);
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}
