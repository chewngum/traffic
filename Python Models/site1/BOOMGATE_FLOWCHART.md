# Boom Gate Simulation - Complete System Flowchart

## 1. SYSTEM OVERVIEW

```mermaid
graph TB
    Client[Client/Frontend] -->|HTTP POST| API[API Handler]
    API -->|Action: runSimulation| Legacy[Legacy Single-Call Mode]
    API -->|Action: getFirstTwoSeedsTiming| Phase1[Two-Step Mode: Phase 1]
    API -->|Action: runRemainingSeeds| Phase2[Two-Step Mode: Phase 2]
    API -->|Action: runSimulationBatched| Batched[Batched Mode with Progress]

    Legacy --> SimEngine[Simulation Engine]
    Phase1 --> SimEngine
    Phase2 --> SimEngine
    Batched --> SimEngine

    SimEngine --> Results[Aggregated Results]
    Results -->|JSON Response| Client

    style API fill:#e1f5ff
    style SimEngine fill:#fff4e1
    style Results fill:#e8f5e9
```

## 2. MAIN SIMULATION ENGINE FLOW

```mermaid
flowchart TD
    Start([Start Simulation]) --> Init[Initialize State Variables]
    Init --> CheckRate{Arrival Rate > 0?}

    CheckRate -->|No| EmptyReturn[Return Empty Results]
    CheckRate -->|Yes| CalcRate[Calculate Adjusted Rate for Headway]

    CalcRate --> InitHeap[Initialize Departure Min-Heap]
    InitHeap --> LoopStart{Current Time < Simulation End?}

    LoopStart -->|No| Cleanup[Process Remaining Departures]
    LoopStart -->|Yes| GenArrival[Generate Exponential Inter-Arrival Time]

    GenArrival --> ApplyHeadway[Apply Minimum Headway Constraint]
    ApplyHeadway --> AdvanceTime[Advance Current Time]
    AdvanceTime --> CheckTime{Time Exceeded?}

    CheckTime -->|Yes| Cleanup
    CheckTime -->|No| ProcessDeps[Process All Departures Before This Arrival]

    ProcessDeps --> PopDep{Heap Not Empty AND Top <= Current Time?}
    PopDep -->|Yes| PopTime[Pop Departure Time from Heap]
    PopTime --> UpdateState1[Update System State: -1]
    UpdateState1 --> ProcessDeps

    PopDep -->|No| GenService[Generate Service Time]
    GenService --> CalcWait[Calculate Waiting Time]
    CalcWait --> AccumStats[Accumulate Statistics]
    AccumStats --> UpdateState2[Update System State: +1]
    UpdateState2 --> ScheduleDep[Schedule Departure in Heap]
    ScheduleDep --> LoopStart

    Cleanup --> FinalUpdate[Final State Time Accumulation]
    FinalUpdate --> CalcMetrics[Calculate Performance Metrics]
    CalcMetrics --> FormatResults[Format Result Object]
    FormatResults --> Return([Return Results])

    style Start fill:#4CAF50,color:#fff
    style Return fill:#4CAF50,color:#fff
    style GenArrival fill:#2196F3,color:#fff
    style GenService fill:#2196F3,color:#fff
    style UpdateState1 fill:#FF9800,color:#fff
    style UpdateState2 fill:#FF9800,color:#fff
    style CalcMetrics fill:#9C27B0,color:#fff
```

## 3. API HANDLER - ACTION ROUTING

```mermaid
flowchart TD
    Request[HTTP POST Request] --> CORS[Set CORS Headers]
    CORS --> Options{OPTIONS Request?}

    Options -->|Yes| OK200[Return 200 OK]
    Options -->|No| CheckMethod{POST Method?}

    CheckMethod -->|No| Err405[Return 405 Method Not Allowed]
    CheckMethod -->|Yes| ParseBody[Parse Request Body]

    ParseBody --> RouteAction{Action Type?}

    RouteAction -->|runSimulationBatched| Batched[Batched Execution]
    RouteAction -->|getFirstTwoSeedsTiming| TwoSeedTiming[First Two Seeds]
    RouteAction -->|runRemainingSeeds| Remaining[Remaining Seeds]
    RouteAction -->|runSimulation| SingleCall[Single Call Legacy]
    RouteAction -->|Unknown| Err400[Return 400 Bad Request]

    Batched --> Response[JSON Response]
    TwoSeedTiming --> Response
    Remaining --> Response
    SingleCall --> Response

    ParseBody -->|Error| Catch[Catch Block]
    Catch --> Err500[Return 500 Internal Server Error]

    style Request fill:#e1f5ff
    style Response fill:#e8f5e9
    style Err405 fill:#ffcdd2
    style Err400 fill:#ffcdd2
    style Err500 fill:#ffcdd2
```

## 4. BATCHED EXECUTION MODE (Detailed)

```mermaid
flowchart TD
    Start([Start Batched]) --> InitAccum[Initialize Result Accumulators]
    InitAccum --> InitTiming[Initialize Seed Timing Array]

    InitTiming --> BatchLoop{More Batches?}
    BatchLoop -->|No| AggPhase[Aggregation Phase]
    BatchLoop -->|Yes| BatchStart[Start Batch Timer]

    BatchStart --> SeedLoop{Seeds in Batch?}
    SeedLoop -->|Yes| GenSeed[Generate/Select Seed Value]
    GenSeed --> RunSim[Run Single Simulation]
    RunSim --> Collect[Collect Seed Data]
    Collect --> SeedLoop

    SeedLoop -->|No| BatchEnd[End Batch Timer]
    BatchEnd --> CalcBatchTime[Calculate Avg Time Per Seed]
    CalcBatchTime --> UpdateRolling[Update Rolling Average Window]
    UpdateRolling --> EstRemaining[Estimate Remaining Time]
    EstRemaining --> LogProgress[Log Progress to Console]
    LogProgress --> BatchLoop

    AggPhase --> AggScalar[Aggregate Scalar Metrics]
    AggScalar --> AggSystem[Aggregate System State Distribution]
    AggSystem --> AggHourly[Aggregate Hourly Max Distribution]
    AggHourly --> FormatFinal[Format Final Results]
    FormatFinal --> ReturnJSON[Return JSON with Timing Stats]
    ReturnJSON --> End([End])

    style Start fill:#4CAF50,color:#fff
    style End fill:#4CAF50,color:#fff
    style RunSim fill:#2196F3,color:#fff
    style AggPhase fill:#9C27B0,color:#fff
    style ReturnJSON fill:#e8f5e9
```

## 5. TWO-STEP EXECUTION MODE

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant SimEngine

    Client->>API: POST getFirstTwoSeedsTiming
    activate API
    API->>SimEngine: Run Seed 0 (Warm-up)
    activate SimEngine
    SimEngine-->>API: First Result
    deactivate SimEngine

    API->>SimEngine: Run Seed 1 (Timed)
    activate SimEngine
    Note over API,SimEngine: Measure execution time
    SimEngine-->>API: Second Result + Timing
    deactivate SimEngine

    API->>API: Calculate Estimated Total Time
    API-->>Client: Return Timing Estimate + 2 Results
    deactivate API

    Note over Client: User reviews estimate<br/>Decides to proceed

    Client->>API: POST runRemainingSeeds<br/>(includes first 2 results)
    activate API

    loop For Each Remaining Seed
        API->>SimEngine: Run Seed N
        activate SimEngine
        SimEngine-->>API: Result N
        deactivate SimEngine
        API->>API: Collect Result
    end

    API->>API: Aggregate All Results<br/>(including first 2)
    API-->>Client: Return Final Aggregated Results
    deactivate API
```

## 6. SINGLE SIMULATION - DETAILED EVENT PROCESSING

```mermaid
flowchart LR
    subgraph "Arrival Processing"
        A1[Generate Exponential<br/>Inter-Arrival Time] --> A2[Apply Min Headway]
        A2 --> A3[Advance Clock]
        A3 --> A4{Track if<br/>Constrained}
    end

    subgraph "Departure Processing"
        D1{Heap Not Empty?} --> D2{Top Time <= Current?}
        D2 -->|Yes| D3[Pop from Heap]
        D3 --> D4[Update State: -1]
        D4 --> D1
        D2 -->|No| D5[Done]
    end

    subgraph "Service & Scheduling"
        S1[Generate Part 1 Time] --> S2[Generate Part 2 Time]
        S2 --> S3[Total Service Time]
        S3 --> S4[Calculate Wait Time]
        S4 --> S5[Schedule Departure]
        S5 --> S6[Push to Heap]
    end

    subgraph "State Tracking"
        T1[Accumulate Time<br/>in Current State] --> T2[Update Hourly Max]
        T2 --> T3[Transition State]
        T3 --> T4[Initialize New State<br/>if Needed]
    end

    A4 --> D1
    D5 --> S1
    S6 --> T1

    style A1 fill:#E3F2FD
    style S1 fill:#FFF3E0
    style T1 fill:#F3E5F5
    style D3 fill:#FFEBEE
```

## 7. DATA STRUCTURES

```mermaid
graph TB
    subgraph "Input Parameters"
        P1[simulationHours]
        P2[arrivalRate]
        P3[minHeadway]
        P4[servicePart1]
        P5[servicePart2]
        P6[part1IsExp]
        P7[part2IsExp]
        P8[numSeeds]
        P9[seedMode]
    end

    subgraph "Runtime State"
        R1[systemState: current count]
        R2[serverFreeTime: next available]
        R3[departureHeap: min-heap]
        R4[stateTimeAccumulator: object]
        R5[hourlyMaximums: array]
        R6[totalWaitingTime: accumulator]
        R7[customersWhoWaited: counter]
        R8[totalServiceTime: accumulator]
    end

    subgraph "Output Metrics"
        O1[avgArrivalsPerHour]
        O2[serverUtilization]
        O3[avgWaitTimePerArrival]
        O4[avgWaitTimePerWaiter]
        O5[probabilityOfWaiting]
        O6[systemStatePercentages]
        O7[hourlyMaxDistribution]
        O8[constrainedArrivals]
    end

    P1 -.-> R1
    P2 -.-> R1
    R1 --> O1
    R6 --> O3
    R7 --> O4
    R8 --> O2
    R4 --> O6
    R5 --> O7

    style P1 fill:#E8EAF6
    style R1 fill:#FFF9C4
    style O1 fill:#C8E6C9
```

## 8. HEAP OPERATIONS

```mermaid
flowchart TD
    subgraph "Heap Push Operation"
        HP1[Add Element to End] --> HP2[Get Parent Index]
        HP2 --> HP3{Element < Parent?}
        HP3 -->|Yes| HP4[Swap with Parent]
        HP4 --> HP5{At Root?}
        HP5 -->|No| HP2
        HP5 -->|Yes| HPDone[Done]
        HP3 -->|No| HPDone
    end

    subgraph "Heap Pop Operation"
        PO1[Store Root Element] --> PO2[Move Last to Root]
        PO2 --> PO3[Get Child Indices]
        PO3 --> PO4{Current > Smallest Child?}
        PO4 -->|Yes| PO5[Swap with Smallest]
        PO5 --> PO6{At Leaf?}
        PO6 -->|No| PO3
        PO6 -->|Yes| PODone[Return Stored Root]
        PO4 -->|No| PODone
    end

    style HP1 fill:#B3E5FC
    style PO1 fill:#FFE0B2
```

## 9. PERFORMANCE METRICS CALCULATION

```mermaid
flowchart LR
    subgraph "Accumulators"
        A1[Total Waiting Time]
        A2[Total Service Time]
        A3[Customers Who Waited]
        A4[Total Customers]
        A5[State Time Accumulator]
    end

    subgraph "Calculations"
        C1[Avg Wait = Total Wait / Total Customers]
        C2[Avg Wait for Waiters = Total Wait / Waiters]
        C3[Server Util = Total Service / Sim Time]
        C4[Prob Waiting = Waiters / Total Customers]
        C5[State % = Time in State / Sim Time × 100]
    end

    A1 --> C1
    A1 --> C2
    A2 --> C3
    A3 --> C2
    A3 --> C4
    A4 --> C1
    A4 --> C4
    A5 --> C5

    style A1 fill:#FFE0B2
    style C1 fill:#C5E1A5
```

## 10. MULTI-SEED AGGREGATION

```mermaid
flowchart TD
    Start([Multiple Seed Results]) --> Loop{For Each Metric}

    Loop -->|Yes| Extract[Extract Values from All Seeds]
    Extract --> CalcAvg[Calculate Average]
    CalcAvg --> CalcMin[Calculate Minimum]
    CalcMin --> CalcMax[Calculate Maximum]
    CalcMax --> Store[Store Stats Object]
    Store --> Loop

    Loop -->|No| DistLoop{For Each Distribution?}

    DistLoop -->|System State| AggState[Aggregate State Percentages]
    AggState --> DistLoop

    DistLoop -->|Hourly Max| AggHourly[Aggregate Hourly Maxes]
    AggHourly --> DistLoop

    DistLoop -->|Done| Format[Format Final Response]
    Format --> Return([Return to Client])

    style Start fill:#4CAF50,color:#fff
    style Return fill:#4CAF50,color:#fff
    style CalcAvg fill:#2196F3,color:#fff
    style AggState fill:#9C27B0,color:#fff
```

## Key Components Summary

### 1. **Simulation Core**
- Memory-optimized event processing
- Min-heap for efficient departure management
- O(1) space complexity using accumulators

### 2. **Random Number Generation**
- Seeded LCG for reproducibility
- Exponential distribution via inverse transform
- Support for both exponential and deterministic service times

### 3. **Minimum Headway Constraint**
- Binary search to find adjusted arrival rate
- Ensures realistic vehicle spacing
- Tracks constrained arrivals

### 4. **State Tracking**
- Time-weighted queue length distribution
- Hourly maximum queue lengths
- Server utilization and waiting time metrics

### 5. **API Modes**
- **Legacy**: Single-call, simple
- **Two-Step**: Timing estimation + execution
- **Batched**: Progress tracking with rolling averages

### 6. **Multi-Seed Analysis**
- Statistical aggregation (avg, min, max)
- Confidence intervals via multiple replications
- Distribution aggregation for system states
