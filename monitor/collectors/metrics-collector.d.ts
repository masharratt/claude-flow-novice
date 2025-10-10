export class MetricsCollector {
    previousStats: {};
    collectionStartTime: number;
    swarmInstances: Map<any, any>;
    databaseConnections: any[];
    networkStats: {
        previousBytes: {
            rx: number;
            tx: number;
        };
        previousTime: number;
    };
    collectMetrics(): Promise<{
        timestamp: string;
        collectionTime: number;
        system: {
            cpu: {
                usage: any;
                cores: number;
                model: string;
                speed: number;
                loadAverage: {
                    '1m': number;
                    '5m': number;
                    '15m': number;
                };
            };
            memory: {
                total: number;
                used: number;
                free: number;
                percent: number;
                bandwidth: number;
            };
            uptime: number;
            platform: {
                type: string;
                release: string;
                arch: string;
                hostname: string;
            };
        };
        process: {
            pid: number;
            memory: {
                rss: number;
                heapTotal: number;
                heapUsed: number;
                external: number;
                arrayBuffers: number;
            };
            cpu: {
                user: number;
                system: number;
            };
            uptime: number;
            version: string;
            activeHandles: any;
            activeRequests: any;
        };
        memory: {
            heap: {
                used: number;
                total: number;
                limit: any;
                utilization: number;
            };
            system: {
                total: number;
                free: number;
                used: number;
                processRSS: number;
                processPercent: number;
            };
            gc: {
                lastDuration: number;
                frequency: number;
                pressure: string;
            };
            optimization: {
                efficiency: number;
                recommendations: string[];
            };
        };
        network: {
            bytesIn: number;
            bytesOut: number;
            totalBytesIn: number;
            totalBytesOut: number;
            connections: number;
            latency: number;
        };
        database: {
            connections: number;
            latency: number;
            cacheHitRate: number;
            ioRate: number;
            queriesPerSecond: number;
        };
        swarms: {};
        metadata: {
            collectorVersion: string;
            platform: NodeJS.Platform;
            architecture: string;
            nodeVersion: string;
        };
    }>;
    getSystemMetrics(): Promise<{
        cpu: {
            usage: any;
            cores: number;
            model: string;
            speed: number;
            loadAverage: {
                '1m': number;
                '5m': number;
                '15m': number;
            };
        };
        memory: {
            total: number;
            used: number;
            free: number;
            percent: number;
            bandwidth: number;
        };
        uptime: number;
        platform: {
            type: string;
            release: string;
            arch: string;
            hostname: string;
        };
    }>;
    getCPUUsage(): Promise<any>;
    cpuAverage(): {
        idle: number;
        total: number;
    };
    estimateMemoryBandwidth(): Promise<number>;
    getProcessMetrics(): Promise<{
        pid: number;
        memory: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
            arrayBuffers: number;
        };
        cpu: {
            user: number;
            system: number;
        };
        uptime: number;
        version: string;
        activeHandles: any;
        activeRequests: any;
    }>;
    getAdvancedMemoryMetrics(): Promise<{
        heap: {
            used: number;
            total: number;
            limit: any;
            utilization: number;
        };
        system: {
            total: number;
            free: number;
            used: number;
            processRSS: number;
            processPercent: number;
        };
        gc: {
            lastDuration: number;
            frequency: number;
            pressure: string;
        };
        optimization: {
            efficiency: number;
            recommendations: string[];
        };
    }>;
    getGCStats(): Promise<{
        lastDuration: number;
        frequency: number;
        pressure: string;
    }>;
    calculateMemoryEfficiency(): number;
    getMemoryRecommendations(): string[];
    getNetworkMetrics(): Promise<{
        bytesIn: number;
        bytesOut: number;
        totalBytesIn: number;
        totalBytesOut: number;
        connections: number;
        latency: number;
    }>;
    getNetworkStats(): Promise<{
        rx: number;
        tx: number;
    }>;
    getActiveConnections(): Promise<number>;
    getNetworkLatency(): Promise<number>;
    getDatabaseMetrics(): Promise<{
        connections: number;
        latency: number;
        cacheHitRate: number;
        ioRate: number;
        queriesPerSecond: number;
    }>;
    getSwarmMetrics(): Promise<{}>;
    getClaudeFlowMetrics(): Promise<{}>;
    detectSwarmInstances(): Promise<Map<any, any>>;
    formatSwarmName(swarmId: any): any;
    calculateProgress(swarm: any): any;
    calculateGCFrequency(): number;
    calculateGCPressure(): "high" | "medium" | "low";
    getLatestMetrics(): Promise<{
        timestamp: string;
        collectionTime: number;
        system: {
            cpu: {
                usage: any;
                cores: number;
                model: string;
                speed: number;
                loadAverage: {
                    '1m': number;
                    '5m': number;
                    '15m': number;
                };
            };
            memory: {
                total: number;
                used: number;
                free: number;
                percent: number;
                bandwidth: number;
            };
            uptime: number;
            platform: {
                type: string;
                release: string;
                arch: string;
                hostname: string;
            };
        };
        process: {
            pid: number;
            memory: {
                rss: number;
                heapTotal: number;
                heapUsed: number;
                external: number;
                arrayBuffers: number;
            };
            cpu: {
                user: number;
                system: number;
            };
            uptime: number;
            version: string;
            activeHandles: any;
            activeRequests: any;
        };
        memory: {
            heap: {
                used: number;
                total: number;
                limit: any;
                utilization: number;
            };
            system: {
                total: number;
                free: number;
                used: number;
                processRSS: number;
                processPercent: number;
            };
            gc: {
                lastDuration: number;
                frequency: number;
                pressure: string;
            };
            optimization: {
                efficiency: number;
                recommendations: string[];
            };
        };
        network: {
            bytesIn: number;
            bytesOut: number;
            totalBytesIn: number;
            totalBytesOut: number;
            connections: number;
            latency: number;
        };
        database: {
            connections: number;
            latency: number;
            cacheHitRate: number;
            ioRate: number;
            queriesPerSecond: number;
        };
        swarms: {};
        metadata: {
            collectorVersion: string;
            platform: NodeJS.Platform;
            architecture: string;
            nodeVersion: string;
        };
    }>;
}
