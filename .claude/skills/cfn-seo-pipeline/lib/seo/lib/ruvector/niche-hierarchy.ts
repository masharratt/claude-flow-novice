/**
 * Niche Hierarchy System for SEO Intelligence
 *
 * Provides a hierarchical taxonomy of SEO niches to enable:
 * - Cross-niche intelligence queries
 * - Query expansion by niche relationships
 * - Similarity weighting based on niche proximity
 * - Automatic niche detection from keywords
 *
 * Phase 6, Sprint 1, Task 1: Cross-Niche Intelligence
 */

export type RelationshipType =
  | 'self'       // Same niche
  | 'parent'     // Direct parent
  | 'child'      // Direct child
  | 'sibling'    // Same parent
  | 'cousin'     // Parent's sibling's child
  | 'ancestor'   // Any ancestor
  | 'descendant' // Any descendant
  | 'unrelated'; // No relationship

export interface NicheNode {
  id: string;
  name: string;
  parent?: string;
  children: string[];
  siblings: string[];
  keywords: string[];
  depth: number; // 0 = root
}

export interface QueryExpansion {
  nicheId: string;
  expandedNiches: string[];
  similarityWeights: Record<string, number>; // 1.0 for same, 0.8 for sibling, etc.
}

export interface NicheDetectionResult {
  niche: NicheNode | null;
  confidence: number;
  alternatives: Array<{ niche: NicheNode; confidence: number }>;
}

export interface QueryExpansionOptions {
  includeSiblings?: boolean;    // Default: true
  includeParent?: boolean;      // Default: true
  includeCousins?: boolean;     // Default: false
  maxExpansion?: number;        // Default: 5
}

/**
 * Niche Hierarchy Management
 *
 * Pre-defined hierarchy of common SEO topics with expansion capabilities
 */
export class NicheHierarchy {
  public nodes: Map<string, NicheNode>;
  public root: string;

  constructor() {
    this.nodes = new Map();
    this.root = 'root';
    this.initializeHierarchy();
  }

  /**
   * Initialize pre-defined niche hierarchy
   * Expandable structure with 30+ common SEO niches
   */
  private initializeHierarchy(): void {
    const hierarchy = [
      // Root
      { id: 'root', name: 'Root', parent: undefined, keywords: [] },

      // Business
      { id: 'business', name: 'Business', parent: 'root', keywords: ['business', 'enterprise', 'company', 'corporate'] },
      { id: 'marketing', name: 'Marketing', parent: 'business', keywords: ['marketing', 'advertising', 'promotion', 'branding'] },
      { id: 'digital-marketing', name: 'Digital Marketing', parent: 'marketing', keywords: ['digital marketing', 'online marketing', 'internet marketing'] },
      { id: 'seo', name: 'SEO', parent: 'digital-marketing', keywords: ['seo', 'search engine optimization', 'organic search', 'serp'] },
      { id: 'ppc', name: 'PPC', parent: 'digital-marketing', keywords: ['ppc', 'pay per click', 'google ads', 'paid search'] },
      { id: 'social-media-marketing', name: 'Social Media Marketing', parent: 'digital-marketing', keywords: ['social media', 'smm', 'facebook marketing', 'instagram marketing'] },
      { id: 'content-marketing', name: 'Content Marketing', parent: 'digital-marketing', keywords: ['content marketing', 'blogging', 'content strategy'] },
      { id: 'traditional-marketing', name: 'Traditional Marketing', parent: 'marketing', keywords: ['traditional marketing', 'print advertising', 'tv advertising'] },
      { id: 'ecommerce', name: 'E-commerce', parent: 'business', keywords: ['ecommerce', 'e-commerce', 'online store', 'online shopping'] },
      { id: 'dropshipping', name: 'Dropshipping', parent: 'ecommerce', keywords: ['dropshipping', 'drop shipping', 'fulfillment'] },
      { id: 'amazon-fba', name: 'Amazon FBA', parent: 'ecommerce', keywords: ['amazon fba', 'fba', 'amazon seller', 'amazon business'] },
      { id: 'shopify', name: 'Shopify', parent: 'ecommerce', keywords: ['shopify', 'shopify store', 'shopify theme'] },
      { id: 'finance', name: 'Finance', parent: 'business', keywords: ['finance', 'financial', 'money', 'wealth'] },
      { id: 'investing', name: 'Investing', parent: 'finance', keywords: ['investing', 'investment', 'stocks', 'portfolio'] },
      { id: 'cryptocurrency', name: 'Cryptocurrency', parent: 'finance', keywords: ['cryptocurrency', 'crypto', 'bitcoin', 'blockchain'] },
      { id: 'personal-finance', name: 'Personal Finance', parent: 'finance', keywords: ['personal finance', 'budgeting', 'savings', 'financial planning'] },

      // Technology
      { id: 'technology', name: 'Technology', parent: 'root', keywords: ['technology', 'tech', 'it', 'computing'] },
      { id: 'software-development', name: 'Software Development', parent: 'technology', keywords: ['software development', 'programming', 'coding', 'development'] },
      { id: 'web-development', name: 'Web Development', parent: 'software-development', keywords: ['web development', 'web dev', 'frontend', 'backend'] },
      { id: 'mobile-development', name: 'Mobile Development', parent: 'software-development', keywords: ['mobile development', 'mobile app', 'ios', 'android'] },
      { id: 'devops', name: 'DevOps', parent: 'software-development', keywords: ['devops', 'ci/cd', 'deployment', 'infrastructure'] },
      { id: 'ai-ml', name: 'AI/ML', parent: 'technology', keywords: ['artificial intelligence', 'ai', 'machine learning', 'ml', 'deep learning'] },
      { id: 'cybersecurity', name: 'Cybersecurity', parent: 'technology', keywords: ['cybersecurity', 'security', 'infosec', 'hacking'] },

      // Health
      { id: 'health', name: 'Health', parent: 'root', keywords: ['health', 'healthcare', 'medical', 'wellness'] },
      { id: 'fitness', name: 'Fitness', parent: 'health', keywords: ['fitness', 'workout', 'exercise', 'training'] },
      { id: 'nutrition', name: 'Nutrition', parent: 'health', keywords: ['nutrition', 'diet', 'healthy eating', 'meal plan'] },
      { id: 'mental-health', name: 'Mental Health', parent: 'health', keywords: ['mental health', 'psychology', 'therapy', 'mindfulness'] },

      // Lifestyle
      { id: 'lifestyle', name: 'Lifestyle', parent: 'root', keywords: ['lifestyle', 'living', 'life'] },
      { id: 'travel', name: 'Travel', parent: 'lifestyle', keywords: ['travel', 'tourism', 'vacation', 'destination'] },
      { id: 'food', name: 'Food', parent: 'lifestyle', keywords: ['food', 'cooking', 'recipes', 'culinary'] },
      { id: 'home-garden', name: 'Home & Garden', parent: 'lifestyle', keywords: ['home', 'garden', 'diy', 'interior design'] },
    ];

    // First pass: create all nodes
    for (const node of hierarchy) {
      this.nodes.set(node.id, {
        id: node.id,
        name: node.name,
        parent: node.parent,
        children: [],
        siblings: [],
        keywords: node.keywords,
        depth: 0, // Will be calculated in second pass
      });
    }

    // Second pass: establish relationships and calculate depth
    for (const node of hierarchy) {
      const nicheNode = this.nodes.get(node.id)!;

      // Calculate depth
      nicheNode.depth = this.calculateDepth(node.id);

      // Add to parent's children
      if (node.parent) {
        const parentNode = this.nodes.get(node.parent);
        if (parentNode && !parentNode.children.includes(node.id)) {
          parentNode.children.push(node.id);
        }
      }
    }

    // Third pass: calculate siblings
    for (const [id, node] of this.nodes.entries()) {
      if (node.parent) {
        const parentNode = this.nodes.get(node.parent);
        if (parentNode) {
          node.siblings = parentNode.children.filter(childId => childId !== id);
        }
      }
    }
  }

  /**
   * Calculate depth of a node in the hierarchy
   */
  private calculateDepth(nodeId: string): number {
    let depth = 0;
    let currentId: string | undefined = nodeId;

    while (currentId && currentId !== this.root) {
      const node = this.nodes.get(currentId);
      if (!node?.parent) break;
      currentId = node.parent;
      depth++;
    }

    return depth;
  }

  /**
   * Get parent niche (one level up)
   */
  getParent(nicheId: string): NicheNode | null {
    const node = this.nodes.get(nicheId);
    if (!node?.parent) return null;
    return this.nodes.get(node.parent) || null;
  }

  /**
   * Get all ancestors (up to root)
   */
  getAncestors(nicheId: string): NicheNode[] {
    const ancestors: NicheNode[] = [];
    let currentId: string | undefined = nicheId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node?.parent || node.parent === this.root) break;

      const parent = this.nodes.get(node.parent);
      if (parent) {
        ancestors.push(parent);
      }
      currentId = node.parent;
    }

    return ancestors;
  }

  /**
   * Get direct children
   */
  getChildren(nicheId: string): NicheNode[] {
    const node = this.nodes.get(nicheId);
    if (!node) return [];

    return node.children
      .map(childId => this.nodes.get(childId))
      .filter((child): child is NicheNode => child !== undefined);
  }

  /**
   * Get siblings (same parent)
   */
  getSiblings(nicheId: string): NicheNode[] {
    const node = this.nodes.get(nicheId);
    if (!node) return [];

    return node.siblings
      .map(siblingId => this.nodes.get(siblingId))
      .filter((sibling): sibling is NicheNode => sibling !== undefined);
  }

  /**
   * Get related niches by proximity
   * @param maxDistance - Maximum relationship distance (1=siblings, 2=cousins, etc.)
   */
  getRelatedByProximity(nicheId: string, maxDistance: number): NicheNode[] {
    const related = new Set<string>();
    const queue: Array<{ id: string; distance: number }> = [{ id: nicheId, distance: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;

      if (visited.has(id) || distance > maxDistance) continue;
      visited.add(id);

      if (id !== nicheId) {
        related.add(id);
      }

      const node = this.nodes.get(id);
      if (!node) continue;

      // Add parent
      if (node.parent && distance + 1 <= maxDistance) {
        queue.push({ id: node.parent, distance: distance + 1 });
      }

      // Add children
      for (const childId of node.children) {
        if (distance + 1 <= maxDistance) {
          queue.push({ id: childId, distance: distance + 1 });
        }
      }

      // Add siblings
      for (const siblingId of node.siblings) {
        if (distance + 1 <= maxDistance) {
          queue.push({ id: siblingId, distance: distance + 1 });
        }
      }
    }

    return Array.from(related)
      .map(id => this.nodes.get(id))
      .filter((node): node is NicheNode => node !== undefined);
  }

  /**
   * Get relationship type between two niches
   */
  getRelationship(nicheId1: string, nicheId2: string): RelationshipType {
    if (nicheId1 === nicheId2) return 'self';

    const node1 = this.nodes.get(nicheId1);
    const node2 = this.nodes.get(nicheId2);

    if (!node1 || !node2) return 'unrelated';

    // Check parent/child
    if (node1.parent === nicheId2) return 'parent';
    if (node2.parent === nicheId1) return 'child';

    // Check sibling
    if (node1.siblings.includes(nicheId2)) return 'sibling';

    // Check ancestor/descendant
    const ancestors1 = this.getAncestors(nicheId1).map(n => n.id);
    const ancestors2 = this.getAncestors(nicheId2).map(n => n.id);

    if (ancestors1.includes(nicheId2)) return 'ancestor';
    if (ancestors2.includes(nicheId1)) return 'descendant';

    // Check cousin (share grandparent)
    const parent1 = this.nodes.get(node1.parent || '');
    const parent2 = this.nodes.get(node2.parent || '');

    if (parent1 && parent2 && parent1.parent === parent2.parent) {
      return 'cousin';
    }

    return 'unrelated';
  }

  /**
   * Get similarity weight based on relationship
   */
  private getRelationshipWeight(relationship: RelationshipType): number {
    const weights: Record<RelationshipType, number> = {
      'self': 1.0,
      'parent': 0.85,
      'child': 0.85,
      'sibling': 0.80,
      'ancestor': 0.70,
      'descendant': 0.70,
      'cousin': 0.60,
      'unrelated': 0.0,
    };
    return weights[relationship];
  }

  /**
   * Expand query to include related niches
   */
  expandQueryByHierarchy(
    nicheId: string,
    options?: QueryExpansionOptions
  ): QueryExpansion {
    const opts: Required<QueryExpansionOptions> = {
      includeSiblings: options?.includeSiblings ?? true,
      includeParent: options?.includeParent ?? true,
      includeCousins: options?.includeCousins ?? false,
      maxExpansion: options?.maxExpansion ?? 5,
    };

    const expandedNiches = new Set<string>([nicheId]);
    const similarityWeights: Record<string, number> = { [nicheId]: 1.0 };

    // Add parent
    if (opts.includeParent) {
      const parent = this.getParent(nicheId);
      if (parent && expandedNiches.size < opts.maxExpansion) {
        expandedNiches.add(parent.id);
        similarityWeights[parent.id] = this.getRelationshipWeight('parent');
      }
    }

    // Add siblings
    if (opts.includeSiblings) {
      const siblings = this.getSiblings(nicheId);
      for (const sibling of siblings) {
        if (expandedNiches.size >= opts.maxExpansion) break;
        expandedNiches.add(sibling.id);
        similarityWeights[sibling.id] = this.getRelationshipWeight('sibling');
      }
    }

    // Add cousins
    if (opts.includeCousins) {
      const node = this.nodes.get(nicheId);
      if (node?.parent) {
        const parentSiblings = this.getSiblings(node.parent);
        for (const parentSibling of parentSiblings) {
          if (expandedNiches.size >= opts.maxExpansion) break;
          const cousins = this.getChildren(parentSibling.id);
          for (const cousin of cousins) {
            if (expandedNiches.size >= opts.maxExpansion) break;
            expandedNiches.add(cousin.id);
            similarityWeights[cousin.id] = this.getRelationshipWeight('cousin');
          }
        }
      }
    }

    return {
      nicheId,
      expandedNiches: Array.from(expandedNiches),
      similarityWeights,
    };
  }

  /**
   * Detect niche from keyword/topic
   */
  detectNiche(keyword: string): NicheNode | null {
    const result = this.detectNicheWithConfidence(keyword);
    return result.niche;
  }

  /**
   * Get best matching niche with confidence
   */
  detectNicheWithConfidence(keyword: string): NicheDetectionResult {
    const keywordLower = keyword.toLowerCase().trim();
    const matches: Array<{ niche: NicheNode; confidence: number }> = [];

    for (const [id, node] of this.nodes.entries()) {
      if (id === this.root) continue;

      let confidence = 0;

      // Exact match
      if (node.keywords.includes(keywordLower)) {
        confidence = 1.0;
      } else {
        // Partial match - check if keyword contains or is contained by niche keywords
        for (const nicheKeyword of node.keywords) {
          if (keywordLower.includes(nicheKeyword) || nicheKeyword.includes(keywordLower)) {
            const lengthRatio = Math.min(
              keywordLower.length / nicheKeyword.length,
              nicheKeyword.length / keywordLower.length
            );
            confidence = Math.max(confidence, lengthRatio * 0.8);
          }
        }

        // Check name similarity
        const nameLower = node.name.toLowerCase();
        if (keywordLower.includes(nameLower) || nameLower.includes(keywordLower)) {
          const lengthRatio = Math.min(
            keywordLower.length / nameLower.length,
            nameLower.length / keywordLower.length
          );
          confidence = Math.max(confidence, lengthRatio * 0.9);
        }
      }

      if (confidence > 0) {
        matches.push({ niche: node, confidence });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    const best = matches[0] || null;
    const alternatives = matches.slice(1, 4); // Top 3 alternatives

    return {
      niche: best?.niche || null,
      confidence: best?.confidence || 0,
      alternatives,
    };
  }

  /**
   * Add a custom niche node
   * Useful for expanding the hierarchy dynamically
   */
  addNiche(
    id: string,
    name: string,
    parentId: string,
    keywords: string[]
  ): boolean {
    if (this.nodes.has(id)) {
      return false; // Already exists
    }

    const parent = this.nodes.get(parentId);
    if (!parent) {
      return false; // Parent doesn't exist
    }

    const newNode: NicheNode = {
      id,
      name,
      parent: parentId,
      children: [],
      siblings: parent.children.filter(childId => childId !== id),
      keywords,
      depth: parent.depth + 1,
    };

    this.nodes.set(id, newNode);

    // Update parent
    if (!parent.children.includes(id)) {
      parent.children.push(id);
    }

    // Update siblings
    for (const siblingId of parent.children) {
      if (siblingId !== id) {
        const sibling = this.nodes.get(siblingId);
        if (sibling && !sibling.siblings.includes(id)) {
          sibling.siblings.push(id);
        }
      }
    }

    // Update new node's siblings
    newNode.siblings = parent.children.filter(childId => childId !== id);

    return true;
  }

  /**
   * Get all leaf nodes (niches with no children)
   */
  getLeafNodes(): NicheNode[] {
    return Array.from(this.nodes.values()).filter(
      node => node.id !== this.root && node.children.length === 0
    );
  }

  /**
   * Get niche path from root
   */
  getNichePath(nicheId: string): NicheNode[] {
    const path: NicheNode[] = [];
    let currentId: string | undefined = nicheId;

    while (currentId && currentId !== this.root) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      path.unshift(node);
      currentId = node.parent;
    }

    return path;
  }

  /**
   * Get niche breadcrumb string
   */
  getNicheBreadcrumb(nicheId: string, separator: string = ' > '): string {
    const path = this.getNichePath(nicheId);
    return path.map(node => node.name).join(separator);
  }
}

// Export singleton instance
export const nicheHierarchy = new NicheHierarchy();

// Export factory for testing
export function createNicheHierarchy(): NicheHierarchy {
  return new NicheHierarchy();
}
