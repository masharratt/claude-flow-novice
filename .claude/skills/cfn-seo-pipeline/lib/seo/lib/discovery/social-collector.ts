/**
 * Social Media Keyword Collector
 *
 * Collects keywords from Reddit and Quora based on niche-related questions and topics.
 * Uses free APIs for real-time trend discovery.
 *
 * @module seo/lib/discovery/social-collector
 */

import type { KeywordSource, SocialCollectorOptions } from './types';

/**
 * Reddit post data
 */
interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  subreddit: string;
  created_utc: number;
}

/**
 * Reddit API response
 */
interface RedditResponse {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
  };
}

/**
 * Quora topic data (placeholder for future implementation)
 */
interface QuoraTopic {
  question: string;
  topic: string;
  views: number;
}

/**
 * Extract questions from Reddit post titles
 *
 * Identifies titles that are questions based on question words and punctuation.
 */
function extractQuestionsFromTitle(title: string): string | null {
  const normalized = title.toLowerCase().trim();

  // Check if title contains question indicators
  const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'should', 'does'];
  const hasQuestionWord = questionWords.some(word => normalized.startsWith(word) || normalized.includes(` ${word} `));
  const hasQuestionMark = title.includes('?');

  if (hasQuestionWord || hasQuestionMark) {
    return title;
  }

  return null;
}

/**
 * Classify question type
 */
function classifyQuestionType(question: string): 'what' | 'why' | 'how' | 'when' | 'where' | 'who' | 'other' {
  const normalized = question.toLowerCase().trim();

  if (normalized.startsWith('what')) return 'what';
  if (normalized.startsWith('why')) return 'why';
  if (normalized.startsWith('how')) return 'how';
  if (normalized.startsWith('when')) return 'when';
  if (normalized.startsWith('where')) return 'where';
  if (normalized.startsWith('who')) return 'who';

  return 'other';
}

/**
 * Query Reddit API for subreddit posts
 *
 * @param subreddit - Subreddit name
 * @param limit - Maximum posts to retrieve
 * @param timeFilter - Time filter (hour, day, week, month, year, all)
 * @returns Array of Reddit posts
 */
async function queryReddit(
  subreddit: string,
  limit = 100,
  timeFilter: 'day' | 'week' | 'month' | 'year' | 'all' = 'month'
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=${limit}&t=${timeFilter}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SEO-Keyword-Collector/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API error (${response.status})`);
    }

    const data = await response.json() as RedditResponse;
    return data.data.children.map(child => child.data);
  } catch (error) {
    console.error(`[Social Collector] Error querying r/${subreddit}:`, error);
    return [];
  }
}

/**
 * Extract keywords from Reddit posts
 *
 * @param posts - Array of Reddit posts
 * @param subreddit - Subreddit name
 * @param minEngagement - Minimum engagement score
 * @returns Array of keyword sources
 */
function extractKeywordsFromReddit(
  posts: RedditPost[],
  subreddit: string,
  minEngagement: number,
  taskId: string
): KeywordSource[] {
  const keywords: KeywordSource[] = [];

  for (const post of posts) {
    // Filter by engagement
    if (post.score < minEngagement) continue;

    // Extract question from title
    const question = extractQuestionsFromTitle(post.title);
    if (!question) continue;

    keywords.push({
      keyword: question,
      source: 'social',
      metadata: {
        questionType: classifyQuestionType(question),
        subreddit: post.subreddit,
      },
      discoveredAt: new Date().toISOString(),
      cacheHit: false,
    });
  }

  return keywords;
}

/**
 * Get default subreddits for a niche
 *
 * Maps common niches to relevant subreddits.
 */
function getDefaultSubreddits(niche: string): string[] {
  const nicheMap: Record<string, string[]> = {
    technology: ['technology', 'programming', 'tech', 'gadgets'],
    marketing: ['marketing', 'SEO', 'digitalnomad', 'entrepreneur'],
    fitness: ['fitness', 'loseit', 'bodyweightfitness', 'nutrition'],
    finance: ['personalfinance', 'investing', 'financialindependence'],
    gaming: ['gaming', 'pcgaming', 'consoles', 'gamedev'],
    cooking: ['cooking', 'recipes', 'AskCulinary', 'food'],
    travel: ['travel', 'solotravel', 'backpacking', 'digitalnomad'],
    health: ['health', 'HealthAnxiety', 'nutrition', 'medical'],
    education: ['education', 'teaching', 'learnprogramming', 'AskAcademia'],
    business: ['business', 'entrepreneur', 'smallbusiness', 'startups'],
  };

  const normalized = niche.toLowerCase();
  return nicheMap[normalized] || [normalized]; // Fallback to niche name as subreddit
}

/**
 * Query Quora for topic questions (placeholder)
 *
 * Note: Quora doesn't have an official public API.
 * This is a placeholder for future scraping implementation.
 */
async function queryQuora(topic: string): Promise<QuoraTopic[]> {
  console.warn('[Social Collector] Quora integration not yet implemented');
  console.warn('[Social Collector] Quora requires web scraping (no official API)');
  return [];
}

/**
 * Collect keywords from social media sources
 *
 * Queries Reddit for niche-related questions and pain points.
 * No caching required (free APIs, real-time trends).
 *
 * @param niche - Niche/topic area
 * @param options - Collector options
 * @returns Array of keyword sources from social media
 */
export async function collectFromSocial(
  niche: string,
  options?: SocialCollectorOptions
): Promise<KeywordSource[]> {
  const taskId = options?.taskId || `social-${Date.now()}`;
  const minEngagement = options?.minEngagement || 10;
  const limit = options?.limit || 50;

  console.log(`[Social Collector] Collecting keywords for niche: ${niche}`);

  const allKeywords: KeywordSource[] = [];

  // Get subreddits to query
  const subreddits = options?.subreddits || getDefaultSubreddits(niche);

  console.log(`[Social Collector] Querying ${subreddits.length} subreddits: ${subreddits.join(', ')}`);

  // Query each subreddit
  for (const subreddit of subreddits) {
    console.log(`[Social Collector] Querying r/${subreddit}`);

    const posts = await queryReddit(subreddit, limit * 2, 'month'); // Get more to account for filtering
    const keywords = extractKeywordsFromReddit(posts, subreddit, minEngagement, taskId);

    console.log(`[Social Collector] Found ${keywords.length} questions from r/${subreddit}`);
    allKeywords.push(...keywords);

    // Rate limiting between subreddits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Query Quora if topics provided (placeholder)
  if (options?.quoraTopics && options.quoraTopics.length > 0) {
    console.log('[Social Collector] Quora querying skipped (not implemented)');
    // Future implementation here
  }

  // Deduplicate questions
  const seen = new Set<string>();
  const deduplicated = allKeywords.filter(kw => {
    const normalized = kw.keyword.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  console.log(
    `[Social Collector] Found ${deduplicated.length} unique questions (from ${allKeywords.length} total)`
  );

  return deduplicated.slice(0, limit);
}

/**
 * Get trending questions from Reddit
 *
 * Focuses on recent, high-engagement questions.
 *
 * @param niche - Niche area
 * @param limit - Maximum results
 * @returns Array of trending keyword sources
 */
export async function getTrendingQuestions(niche: string, limit = 25): Promise<KeywordSource[]> {
  const subreddits = getDefaultSubreddits(niche);

  console.log(`[Social Collector] Getting trending questions for ${niche}`);

  const allKeywords: KeywordSource[] = [];

  for (const subreddit of subreddits) {
    // Query recent hot posts
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=50`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'SEO-Keyword-Collector/1.0',
        },
      });

      if (!response.ok) continue;

      const data = await response.json() as RedditResponse;
      const posts = data.data.children.map(child => child.data);

      const keywords = extractKeywordsFromReddit(posts, subreddit, 50, `trending-${Date.now()}`);
      allKeywords.push(...keywords);
    } catch (error) {
      console.error(`[Social Collector] Error querying r/${subreddit}:`, error);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Sort by most recent
  allKeywords.sort((a, b) => {
    return new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
  });

  return allKeywords.slice(0, limit);
}

/**
 * Analyze question patterns in social data
 *
 * Identifies common question patterns and topics.
 *
 * @param keywords - Array of keyword sources
 * @returns Analysis of question patterns
 */
export function analyzeSocialPatterns(keywords: KeywordSource[]): {
  totalQuestions: number;
  questionTypes: Record<string, number>;
  topSubreddits: Array<{ subreddit: string; count: number }>;
  commonTopics: string[];
} {
  const questionTypes: Record<string, number> = {};
  const subredditCounts: Record<string, number> = {};

  for (const kw of keywords) {
    // Count question types
    const type = kw.metadata.questionType || 'other';
    questionTypes[type] = (questionTypes[type] || 0) + 1;

    // Count subreddits
    if (kw.metadata.subreddit) {
      subredditCounts[kw.metadata.subreddit] = (subredditCounts[kw.metadata.subreddit] || 0) + 1;
    }
  }

  // Sort subreddits by count
  const topSubreddits = Object.entries(subredditCounts)
    .map(([subreddit, count]) => ({ subreddit, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Extract common topics (simplified - could use NLP)
  const commonTopics: string[] = [];

  return {
    totalQuestions: keywords.length,
    questionTypes,
    topSubreddits,
    commonTopics,
  };
}
