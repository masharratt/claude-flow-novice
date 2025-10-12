export interface MemoryDashboardProps {
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
  };
  sqliteDbPath?: string;
  refreshInterval?: number;
}

export interface MemoryState {
  redis: {
    keys: RedisKeyInfo[];
    memoryUsage: number;
    connected: boolean;
  };
  sqlite: {
    tables: SQLiteTable[];
    connections: TableConnection[];
    size: number;
  };
  heatmap: MemoryHeatmap;
  loading: boolean;
  error: string | null;
  lastUpdate: Date;
}

export interface RedisKeyInfo {
  key: string;
  type: 'string' | 'list' | 'hash' | 'set' | 'zset' | 'stream';
  memory: number;
  ttl: number;
  size: number;
  lastAccessed?: Date;
}

export interface SQLiteTable {
  name: string;
  size: number;
  rowCount: number;
  columns: string[];
  indexes?: string[];
  foreignKeys?: string[];
}

export interface TableConnection {
  from: string;
  to: string;
  relationship: 'one-to-one' | 'one-to-many' | 'many-to-many';
  joinKey?: string;
}

export interface MemoryHotspot {
  type: 'redis' | 'sqlite';
  name: string;
  severity: 'low' | 'medium' | 'high';
  memoryUsage: number;
  recommendations: string[];
  impact?: number;
}

export interface MemoryHeatmap {
  hotspots: MemoryHotspot[];
  recommendations: string[];
  totalMemory?: number;
  lastAnalysis?: Date;
}

export interface OptimizationRecommendation {
  id: string;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  category: 'redis' | 'sqlite' | 'general';
  action: () => Promise<void>;
  applied?: boolean;
  result?: string;
}

export interface MemoryPattern {
  id: string;
  type: string;
  frequency: number;
  impact: number;
  description: string;
  recommendations: string[];
  affectedKeys: string[];
  affectedTables: string[];
}

export interface RedisClient {
  connect(): Promise<void>;
  disconnect(): void;
  getKeys(pattern: string): Promise<RedisKeyInfo[]>;
  getMemoryInfo(): Promise<{ memoryUsage: number; keyCount: number }>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, callback: (message: string) => void): Promise<void>;
}

export interface RealtimeMonitorConfig {
  onMemoryUpdate: (data: any) => void;
  onHotspotDetected: (hotspot: MemoryHotspot) => void;
  interval?: number;
}

export interface DashboardLayoutProps {
  title: string;
  subtitle: string;
  lastUpdate: Date;
  isRealtimeEnabled: boolean;
  onToggleRealtime: () => void;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
}