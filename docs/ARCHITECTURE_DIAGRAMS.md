# Architecture Diagrams

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Overview

This document contains comprehensive Mermaid diagrams visualizing the standardized integration system architecture, data flows, and component interactions.

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Clients["Client/Agent Layer"]
        A["CFN Agents"]
        B["External Services"]
        C["Scripts/CLI"]
    end

    subgraph Protocol["Protocol & Coordination Layer"]
        P1["Database Query Protocol"]
        P2["Coordination Protocol"]
        P3["Artifact Storage Protocol"]
        P4["Transaction Protocol"]
        P5["Skill Deployment Protocol"]
    end

    subgraph Services["Core Services"]
        S1["DatabaseService"]
        S2["CoordinationManager"]
        S3["ArtifactStorage"]
        S4["TransactionManager"]
        S5["SkillDeployment"]
    end

    subgraph Integration["Integration Layer"]
        I1["Database Drivers"]
        I2["Redis Client"]
        I3["File I/O"]
        I4["Process Executor"]
    end

    subgraph Persistence["Persistence Layer"]
        DB["SQLite/PostgreSQL<br/>Persistent Data"]
        CACHE["Redis<br/>Transient Data"]
        FS["File System<br/>Artifacts"]
    end

    A --> P1
    B --> P2
    C --> P3

    P1 --> S1
    P2 --> S2
    P3 --> S3
    P4 --> S4
    P5 --> S5

    S1 --> I1
    S2 --> I2
    S3 --> I3
    S4 --> I1
    S5 --> I4

    I1 --> DB
    I2 --> CACHE
    I3 --> FS

    style Clients fill:#e1f5ff
    style Protocol fill:#f3e5f5
    style Services fill:#fff3e0
    style Integration fill:#f1f8e9
    style Persistence fill:#fce4ec
```

---

## 2. Query Execution Data Flow

```mermaid
graph LR
    Client["Agent/Client<br/>(correlate-key)"]

    subgraph DatabaseService["DatabaseService"]
        Cache["Check Cache"]
        Schema["Validate Schema"]
        Execute["Execute Query"]
        Format["Format Result"]
        Store["Store in Cache"]
    end

    Redis["Redis Cache<br/>(TTL)"]
    DB["SQLite/PostgreSQL"]
    Response["Return Response<br/>(status + result)"]

    Client -->|Query Request| Cache
    Cache -->|Miss| Schema
    Cache -->|Hit| Response

    Schema -->|Validate| Execute
    Execute -->|Query| DB
    DB -->|Result Set| Format
    Format -->|Cache| Store
    Store -->|Cached| Redis
    Format -->|Return| Response
    Response -->|JSON| Client

    style DatabaseService fill:#fff3e0
    style Redis fill:#fce4ec
    style DB fill:#fce4ec
    style Client fill:#e1f5ff
    style Response fill:#e1f5ff
```

---

## 3. Coordination Signal Flow (Broadcast)

```mermaid
graph LR
    Coordinator["Task Coordinator"]

    subgraph Broadcast["Broadcast Process"]
        Validate["Validate Signal"]
        Publish["Publish to<br/>Redis Pub/Sub"]
        Distribute["Distribute to<br/>Agents"]
    end

    subgraph Agents["Agent Subscribers"]
        A1["Agent 1"]
        A2["Agent 2"]
        AN["Agent N"]
    end

    Processing["Process<br/>Independently"]
    Complete["Report<br/>Completion"]
    Aggregate["Aggregate<br/>Results"]

    Coordinator -->|Signal| Validate
    Validate -->|Publish| Publish
    Publish -->|Topic:<br/>swarm:*| Distribute

    Distribute -->|Message| A1
    Distribute -->|Message| A2
    Distribute -->|Message| AN

    A1 --> Processing
    A2 --> Processing
    AN --> Processing

    Processing -->|Done| Complete
    Complete -->|Report| Aggregate
    Aggregate -->|Consensus| Coordinator

    style Coordinator fill:#fff3e0
    style Broadcast fill:#f3e5f5
    style Agents fill:#e1f5ff
    style Complete fill:#c8e6c9
```

---

## 4. Transaction Execution with Savepoints

```mermaid
graph TD
    Start["Begin Transaction<br/>(correlation-key)"]

    subgraph Execution["Transaction Execution"]
        Op1["Execute Operation 1"]
        SP1["Savepoint 1"]
        Op2["Execute Operation 2"]
        SP2["Savepoint 2"]
        Op3["Execute Operation 3"]
    end

    subgraph Decision["Commit Decision"]
        Check["Check for<br/>Conflicts"]
        Conflict{"Conflict?"}
        Rollback["Rollback to<br/>Savepoint"]
        Commit["Commit All<br/>Changes"]
        Log["Write to<br/>Audit Log"]
    end

    Start --> Op1
    Op1 --> SP1
    SP1 --> Op2
    Op2 --> SP2
    SP2 --> Op3

    Op3 --> Check
    Check --> Conflict

    Conflict -->|Yes| Rollback
    Rollback -->|Retry| Op3

    Conflict -->|No| Commit
    Commit --> Log
    Log -->|Done| Response["Return Result<br/>(success)"]

    style Execution fill:#fff3e0
    style Decision fill:#f3e5f5
    style Log fill:#c8e6c9
    style Response fill:#e1f5ff
```

---

## 5. Artifact Versioning Timeline

```mermaid
graph LR
    subgraph Timeline["Artifact Lifecycle"]
        V0["Initial<br/>v0"]
        V1["Edit 1<br/>v1"]
        V2["Edit 2<br/>v2"]
        V3["Edit 3<br/>v3"]
        V4["Archive<br/>v1-2"]
        V5["Current<br/>v3"]
    end

    subgraph Storage["Storage Locations"]
        Active["Active<br/>Filesystem"]
        Meta["Metadata<br/>SQLite"]
        Archive["Archive<br/>Cold Storage"]
    end

    Diff["Version Diff<br/>V2 → V3"]

    V0 -->|Create| V1
    V1 -->|Edit| V2
    V2 -->|Edit| V3
    V3 -->|Cleanup<br/>90d| V4
    V4 -->|Current| V5

    V1 -->|Store| Active
    V2 -->|Store| Active
    V3 -->|Store| Active

    V1 -->|Index| Meta
    V2 -->|Index| Meta
    V3 -->|Index| Meta

    V4 -->|Archive| Archive

    V3 -->|Compare| Diff

    style Timeline fill:#fff3e0
    style Storage fill:#fce4ec
    style Diff fill:#f3e5f5
```

---

## 6. Skill Deployment Process

```mermaid
graph TD
    Request["Execute Skill<br/>(skill-name, params)"]

    subgraph Discovery["Skill Discovery"]
        Find["Find Skill File<br/>(.claude/skills/...)"]
        Parse["Parse Frontmatter<br/>(metadata)"]
        Check["Check Dependencies<br/>(required commands)"]
    end

    subgraph Preparation["Environment Preparation"]
        Inject["Inject Environment<br/>Variables"]
        Validate["Validate Injection<br/>(required fields)"]
        Prepare["Prepare Execution<br/>Context"]
    end

    subgraph Execution["Execution"]
        Run["Execute Script<br/>(bash)"]
        Monitor["Monitor Process<br/>(timeout, CPU)"]
        Capture["Capture Output<br/>(stdout/stderr)"]
    end

    subgraph Processing["Result Processing"]
        Parse2["Parse JSON Output"]
        Validate2["Validate Schema"]
        Metrics["Record Metrics"]
        Return["Return Response"]
    end

    Request --> Find
    Find --> Parse
    Parse --> Check

    Check -->|OK| Inject
    Check -->|Missing| Error["Error:<br/>Missing Dependency"]

    Inject --> Validate
    Validate --> Prepare

    Prepare --> Run
    Run --> Monitor
    Monitor -->|Timeout| Timeout["Error:<br/>Timeout"]
    Monitor -->|OK| Capture

    Capture --> Parse2
    Parse2 -->|Invalid| Error2["Error:<br/>Invalid JSON"]
    Parse2 -->|Valid| Validate2

    Validate2 --> Metrics
    Metrics --> Return

    style Discovery fill:#fff3e0
    style Preparation fill:#f3e5f5
    style Execution fill:#e1f5ff
    style Processing fill:#f1f8e9
    style Error fill:#ffcdd2
    style Error2 fill:#ffcdd2
```

---

## 7. Schema Mapping Cross-Database Query

```mermaid
graph LR
    Client["Query Request<br/>(schema: agents)"]

    subgraph Mapping["Schema Mapping Service"]
        Load["Load Source Schema"]
        Load2["Load Target Schema"]
        Transform["Create Field Mappings"]
        Build["Build Target Query"]
    end

    subgraph Execution["Query Execution"]
        Q1["Execute on<br/>Source DB"]
        Q2["Execute on<br/>Target DB"]
        Merge["Merge Results<br/>(correlation key)"]
    end

    subgraph Databases["Databases"]
        SourceDB["Source Database<br/>(primary)"]
        TargetDB["Target Database<br/>(cache)"]
    end

    Response["Return Unified<br/>Result Set"]

    Client --> Load
    Client --> Load2

    Load --> Transform
    Load2 --> Transform

    Transform --> Build

    Build -->|Transformed| Q1
    Build -->|Transformed| Q2

    Q1 -->|Query| SourceDB
    Q2 -->|Query| TargetDB

    SourceDB -->|Result| Merge
    TargetDB -->|Result| Merge

    Merge --> Response

    style Mapping fill:#f3e5f5
    style Execution fill:#fff3e0
    style Databases fill:#fce4ec
    style Response fill:#e1f5ff
```

---

## 8. Correlation Key Lifecycle

```mermaid
graph LR
    Gen["Generate<br/>Correlation Key<br/>op-001:iter-1:ts"]

    subgraph Systems["System Components"]
        QP["Query<br/>Processed"]
        CO["Coordination<br/>Signal"]
        AR["Artifact<br/>Stored"]
        TXN["Transaction<br/>Logged"]
    end

    subgraph Tracking["Tracking"]
        L1["Log Entry 1"]
        L2["Log Entry 2"]
        L3["Log Entry 3"]
        L4["Log Entry 4"]
    end

    Audit["Audit Trail<br/>(complete trace)"]

    Gen --> QP
    Gen --> CO
    Gen --> AR
    Gen --> TXN

    QP -->|Log| L1
    CO -->|Log| L2
    AR -->|Log| L3
    TXN -->|Log| L4

    L1 --> Audit
    L2 --> Audit
    L3 --> Audit
    L4 --> Audit

    style Gen fill:#fff3e0
    style Systems fill:#e1f5ff
    style Tracking fill:#f3e5f5
    style Audit fill:#c8e6c9
```

---

## 9. Error Handling and Retry Pattern

```mermaid
graph TD
    Request["Request<br/>(correlation-key)"]

    Attempt1["Attempt 1<br/>(Immediate)"]
    Result1{"Success?"}

    Wait1["Wait 1s"]
    Attempt2["Attempt 2"]
    Result2{"Success?"}

    Wait2["Wait 2s"]
    Attempt3["Attempt 3"]
    Result3{"Success?"}

    Wait3["Wait 4s"]
    Attempt4["Attempt 4"]
    Result4{"Success?"}

    Success["Return<br/>Success Response"]
    Failure["Return<br/>Error Response<br/>(with details)"]

    Request --> Attempt1
    Attempt1 --> Result1

    Result1 -->|Yes| Success
    Result1 -->|No| Wait1

    Wait1 --> Attempt2
    Attempt2 --> Result2

    Result2 -->|Yes| Success
    Result2 -->|No| Wait2

    Wait2 --> Attempt3
    Attempt3 --> Result3

    Result3 -->|Yes| Success
    Result3 -->|No| Wait3

    Wait3 --> Attempt4
    Attempt4 --> Result4

    Result4 -->|Yes| Success
    Result4 -->|No| Failure

    style Attempt1 fill:#e1f5ff
    style Attempt2 fill:#e1f5ff
    style Attempt3 fill:#e1f5ff
    style Attempt4 fill:#e1f5ff
    style Success fill:#c8e6c9
    style Failure fill:#ffcdd2
```

---

## 10. Deployment Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        LB["Load Balancer"]
    end

    subgraph Agents["Agent Tier"]
        A1["Agent Node 1"]
        A2["Agent Node 2"]
        AN["Agent Node N"]
    end

    subgraph Services["Service Tier"]
        DS["Database<br/>Service"]
        CM["Coordination<br/>Manager"]
        AS["Artifact<br/>Storage"]
    end

    subgraph Data["Data Tier"]
        RC["Redis<br/>Cluster<br/>(HA)"]
        DB["PostgreSQL<br/>Cluster<br/>(HA, WAL)"]
        FS["Artifact<br/>Storage<br/>(S3/NFS)"]
    end

    LB --> A1
    LB --> A2
    LB --> AN

    A1 --> DS
    A2 --> CM
    AN --> AS

    DS --> DB
    CM --> RC
    AS --> FS

    RC -.->|Replication| RC
    DB -.->|Replication| DB

    style Client fill:#e1f5ff
    style Agents fill:#fff3e0
    style Services fill:#f3e5f5
    style Data fill:#fce4ec
```

---

## 11. Cache Hit/Miss Pattern

```mermaid
graph LR
    Request["Query Request<br/>(cache_ttl: 300s)"]

    Check["Check Redis<br/>Cache"]

    Hit{"Hit?"}

    HitPath["<b>CACHE HIT</b><br/>Found in cache<br/>< 1ms"]
    MissPath["<b>CACHE MISS</b><br/>Not in cache"]

    DBQuery["Query Database<br/>50-100ms"]
    Format["Format & Cache<br/>Add to Redis<br/>TTL: 300s"]

    Response["Return Result<br/>+ metadata"]

    Request --> Check
    Check --> Hit

    Hit -->|Yes| HitPath
    HitPath -->|metadata:<br/>from_cache: true| Response

    Hit -->|No| MissPath
    MissPath --> DBQuery
    DBQuery --> Format
    Format -->|metadata:<br/>from_cache: false| Response

    style HitPath fill:#c8e6c9
    style MissPath fill:#ffcdd2
    style Response fill:#e1f5ff
```

---

## 12. Integration Point Matrix

```mermaid
graph TD
    subgraph DB["Database (10)"]
        DB1["Query Execution"]
        DB2["Schema Registration"]
        DB3["Transaction Management"]
    end

    subgraph COORD["Coordination (8)"]
        C1["Signal Broadcast"]
        C2["Wait Mechanism"]
        C3["Consensus Collection"]
    end

    subgraph ART["Artifact (9)"]
        AR1["Store Artifact"]
        AR2["Retrieve Version"]
        AR3["List Versions"]
    end

    subgraph TXN["Transaction (6)"]
        T1["Begin Transaction"]
        T2["Savepoint Creation"]
        T3["Conflict Resolution"]
    end

    subgraph SKILL["Skill (7)"]
        S1["Frontmatter Parsing"]
        S2["Environment Injection"]
        S3["Execution"]
    end

    subgraph PERSIST["Persistence (4)"]
        P1["Reflection Write"]
        P2["Correlation Key"]
        P3["Cache Invalidation"]
    end

    style DB fill:#fff3e0
    style COORD fill:#f3e5f5
    style ART fill:#fce4ec
    style TXN fill:#fff3e0
    style SKILL fill:#e1f5ff
    style PERSIST fill:#f1f8e9
```

---

**Document Reference:** ARCHITECTURE_DIAGRAMS.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16

All diagrams use Mermaid syntax and can be viewed with:
- GitHub markdown rendering
- Mermaid online editor: https://mermaid.live
- Visual Studio Code with Mermaid extension
- Any Mermaid-compatible documentation system
