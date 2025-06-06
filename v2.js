// Configuration constants
const wordSizeBytes = 4; // 32 bits
const wordsPerLine = 16;
const cacheSize = 16;
const memorySize = 32768; // 32K words
const memoryDelay = 4; // Memory access delay in cycles
const cacheDelay = 1; // Cache access delay in cycles

class CacheLine {
    constructor() {
        this.tag = -1; 
        this.valid = 0;
        this.data = new Array(wordsPerLine).fill(0);
    }

    updateCacheLine(tag, newData) {
        this.tag = tag;
        this.valid = 1;
        this.data = [...newData];
    }

    isCacheHit(addressTag) {
        return (addressTag === this.tag) && (this.valid === 1);
    }
}

class Cache {
    constructor() {
        this.cache = new Array(cacheSize).fill().map(() => new CacheLine());
        this.totalMisses = 0;
        this.totalHits = 0;
    }

    getIndex(address) {
        return Math.floor((address / wordsPerLine) % cacheSize);
    }

    getTag(address) {
        return Math.floor(address / wordsPerLine / cacheSize);
    }

    read(address) {
        const index = this.getIndex(address);
        const tag = this.getTag(address);
        const offset = address % wordsPerLine;
        
        if (this.cache[index].isCacheHit(tag)) {
            this.totalHits++;
            return { hit: true, data: this.cache[index].data[offset] };
        } else {
            this.totalMisses++;
            return { hit: false, index, tag, offset };
        }
    }

    viewLine(lineIndex) {
        if (lineIndex < 0 || lineIndex >= cacheSize) {
            return { error: "Invalid cache line index" };
        }
        return {
            tag: this.cache[lineIndex].valid === 1 ? this.cache[lineIndex].tag : "null",
            valid: this.cache[lineIndex].valid,
            data: [...this.cache[lineIndex].data]
        };
    }
}

class Memory {
    constructor() {
        this.lines = Math.floor(memorySize / wordsPerLine);
        this.data = new Array(this.lines).fill().map(() => new Array(wordsPerLine).fill(0));
        this.delay = memoryDelay;
        this.count = 0;
        this.servingStage = null;
        this.pendingOperation = null;
    }

    getLineAndOffset(address) {
        const lineIndex = Math.floor((address / wordsPerLine) % this.lines);
        const offset = address % wordsPerLine;
        return { lineIndex, offset };
    }

    read(address, stage) {
        if (this.count > 0) {
            // Memory is busy
            if (stage === this.servingStage) {
                this.count--;
                console.log(`Memory still busy: ${this.count} cycles remaining for ${stage}`);
                if (this.count === 0) {
                    const { lineIndex, offset } = this.getLineAndOffset(address);
                    const result = { 
                        status: "done", 
                        data: this.data[lineIndex][offset], 
                        line: [...this.data[lineIndex]] 
                    };
                    console.log(`Memory read complete: addr=${address}, value=${result.data}`);
                    this.servingStage = null;
                    this.pendingOperation = null;
                    return result;
                }
            }
            return { status: "wait", remainingCycles: this.count };
        } else {
            this.count = this.delay;
            this.servingStage = stage;
            this.pendingOperation = { type: "read", address };
            console.log(`Starting memory read: addr=${address}, stage=${stage}, delay=${this.delay}`);
            return { status: "wait", remainingCycles: this.count };
        }
    }

    write(address, value, stage) {
        if (this.count > 0) {
            // Memory is busy
            if (stage === this.servingStage) {
                this.count--;
                console.log(`Memory still busy: ${this.count} cycles remaining for ${stage}`);
                if (this.count === 0) {
                    const { lineIndex, offset } = this.getLineAndOffset(address);
                    this.data[lineIndex][offset] = value;
                    console.log(`Memory write complete: addr=${address}, value=${value}`);
                    const result = { status: "done" };
                    this.servingStage = null;
                    this.pendingOperation = null;
                    return result;
                }
            }
            return { status: "wait", remainingCycles: this.count };
        } else {
            // Start new write operation
            this.count = this.delay;
            this.servingStage = stage;
            this.pendingOperation = { type: "write", address, value };
            console.log(`Starting memory write: addr=${address}, value=${value}, stage=${stage}, delay=${this.delay}`);
            return { status: "wait", remainingCycles: this.count };
        }
    }

    viewLine(lineIndex) {
        if (lineIndex < 0 || lineIndex >= this.lines) {
            return { error: "Invalid memory line index" };
        }
        return [...this.data[lineIndex]];
    }
}

// Memory system that combines cache and main memory
class MemorySystem {
    constructor() {
        this.cache = new Cache();
        this.memory = new Memory();
        this.readCount = 0;
        this.writeCount = 0;
        
        // Add cache delay handling
        this.cacheDelay = cacheDelay;
        this.cacheCount = 0;
        this.cacheServingStage = null;
        this.cachePendingOperation = null;
        
        // Pipeline state tracking
        this.pendingRequests = new Map(); // Map to track pending requests by stage
    }

    // Process one clock cycle - returns true if any stage made progress
    processCycle() {
        let progress = false;
        
        // Process each stage request
        for (const [stage, request] of this.pendingRequests.entries()) {
            const result = this.processRequest(request);
            
            if (result.status === "done") {
                console.log(`Request for stage ${stage} completed with result:`, result);
                this.pendingRequests.delete(stage);
                progress = true;
            }
        }
        
        return progress;
    }
    
    processRequest(request) {
        if (request.type === 'read') {
            return this.processRead(request.address, request.stage);
        } else if (request.type === 'write') {
            return this.processWrite(request.address, request.value, request.stage);
        }
        return { status: 'error', message: 'Unknown request type' };
    }

    read(address, stage) {
        this.readCount++;
        
        // If cache is already serving another stage, immediately return wait
        if (this.cacheServingStage !== null && this.cacheServingStage !== stage) {
            console.log(`Cache busy serving stage ${this.cacheServingStage}, stage ${stage} must wait`);
            return { status: "wait", message: `Cache busy serving stage ${this.cacheServingStage}` };
        }
        
        // If this stage already has a pending request, return its status
        if (this.pendingRequests.has(stage)) {
            const pendingRequest = this.pendingRequests.get(stage);
            const result = this.processRequest(pendingRequest);
            
            if (result.status === "done") {
                this.pendingRequests.delete(stage);
                return result;
            }
            return { status: "wait", message: `Previous request for stage ${stage} still in progress` };
        }
        
        // Check cache
        const cacheResult = this.cache.read(address);
        
        if (cacheResult.hit) {
            // Cache hit - but still need to handle cache delay
            if (this.cacheCount === 0) {
                this.cacheCount = this.cacheDelay;
                this.cacheServingStage = stage;
                this.cachePendingOperation = { type: "read", address, hit: true, data: cacheResult.data };
                
                // If cache delay is 0, return immediately
                if (this.cacheDelay === 0) {
                    console.log(`Cache hit for address ${address} from stage ${stage}, no delay`);
                    this.cacheServingStage = null;
                    this.cachePendingOperation = null;
                    return { status: "done", data: cacheResult.data, source: "cache" };
                }
                
                console.log(`Cache hit for address ${address} from stage ${stage}, delay=${this.cacheDelay}`);
                
                // Add to pending requests
                this.pendingRequests.set(stage, { type: 'read', address, stage, cacheHit: true });
                return { status: "wait", message: "Cache hit, waiting for delay" };
            } else if (this.cacheServingStage === stage) {
                // Continue counting down cache delay
                this.cacheCount--;
                console.log(`Cache delay: ${this.cacheCount} cycles remaining for ${stage}`);
                
                if (this.cacheCount === 0) {
                    // Cache delay complete
                    const result = { 
                        status: "done", 
                        data: this.cachePendingOperation.data, 
                        source: "cache" 
                    };
                    console.log(`Cache read complete: addr=${address}, value=${result.data}`);
                    this.cacheServingStage = null;
                    this.cachePendingOperation = null;
                    this.pendingRequests.delete(stage);
                    return result;
                }
                return { status: "wait", remainingCycles: this.cacheCount };
            }
        } else {
            // Cache miss - need to access memory
            console.log(`Cache miss for address ${address} from stage ${stage}, forwarding to memory`);
            
            // Add to pending requests
            this.pendingRequests.set(stage, { type: 'read', address, stage, cacheHit: false });
            return { status: "wait", message: "Cache miss, waiting for memory" };
        }
        
        // Shouldn't reach here
        return { status: "error", message: "Unexpected state in read operation" };
    }

    processRead(address, stage) {
        // Get request details
        const request = this.pendingRequests.get(stage);
        
        if (request.cacheHit) {
            // Process cache hit with delay
            if (this.cacheServingStage === stage) {
                this.cacheCount--;
                if (this.cacheCount === 0) {
                    const cacheResult = this.cache.read(address);
                    this.cacheServingStage = null;
                    return { 
                        status: "done", 
                        data: cacheResult.data, 
                        source: "cache" 
                    };
                }
                return { status: "wait", remainingCycles: this.cacheCount };
            }
        } else {
            // Process cache miss - forward to memory
            const memResult = this.memory.read(address, stage);
            
            if (memResult.status === "done") {
                // Memory access complete, update cache
                const index = this.cache.getIndex(address);
                const tag = this.cache.getTag(address);
                this.cache.cache[index].updateCacheLine(tag, memResult.line);
                
                console.log(`Cache updated with data from memory for address ${address}`);
                return { 
                    status: "done", 
                    data: memResult.data, 
                    source: "memory",
                    message: `Data loaded from memory: ${memResult.data}`
                };
            } else {
                return { status: "wait", remainingCycles: memResult.remainingCycles };
            }
        }
        
        return { status: "wait", message: "Processing read operation" };
    }

    writeThrough(address, value, stage) {
        this.writeCount++;
        
        // If cache is already serving another stage, immediately return wait
        if (this.cacheServingStage !== null && this.cacheServingStage !== stage) {
            console.log(`Cache busy serving stage ${this.cacheServingStage}, stage ${stage} must wait`);
            return { status: "wait", message: `Cache busy serving stage ${this.cacheServingStage}` };
        }
        
        // If this stage already has a pending request, return its status
        if (this.pendingRequests.has(stage)) {
            const pendingRequest = this.pendingRequests.get(stage);
            const result = this.processRequest(pendingRequest);
            
            if (result.status === "done") {
                this.pendingRequests.delete(stage);
                return result;
            }
            return { status: "wait", message: `Previous request for stage ${stage} still in progress` };
        }
        
        // Update cache if applicable (hit)
        const index = this.cache.getIndex(address);
        const tag = this.cache.getTag(address);
        const offset = address % wordsPerLine;
        
        if (this.cache.cache[index].isCacheHit(tag)) {
            this.cache.cache[index].data[offset] = value;
            this.cache.totalHits++;
            console.log(`Cache hit: Updated address ${address} with value ${value} in cache`);
        } else {
            this.cache.totalMisses++;
            console.log(`Cache miss for address ${address} during write-through`);
        }
        
        // Add to pending requests - always need to write to memory
        this.pendingRequests.set(stage, { type: 'write', address, value, stage });
        console.log(`Queuing write to address ${address} with value ${value} from stage ${stage}`);
        
        return { status: "wait", message: "Memory write queued" };
    }

    write(address, value, stage) {
        return this.writeThrough(address, value, stage);
    }

    processWrite(address, value, stage) {
        // Process write to memory
        const memResult = this.memory.write(address, value, stage);
        
        if (memResult.status === "done") {
            console.log(`Memory write complete for address ${address} with value ${value} from stage ${stage}`);
            
            return { 
                status: "done", 
                message: `Write complete: Value ${value} written to address ${address}`
            };
        } else {
            return { status: "wait", remainingCycles: memResult.remainingCycles };
        }
    }

    viewCache(lineIndex) {
        return this.cache.viewLine(lineIndex);
    }

    viewMemory(lineIndex) {
        return this.memory.viewLine(lineIndex);
    }

    viewEntireCache() {
        console.log("\n--- Entire Cache State ---");
        for (let i = 0; i < cacheSize; i++) {
            const line = this.cache.viewLine(i);
            console.log(`Cache Line ${i}: Valid=${line.valid}, Tag=${line.tag}, Data=${line.data}`);
        }
    }

    viewEntireMemory() {
        console.log("\n--- Entire Memory State (first 10 lines) ---");
        for (let i = 0; i < 10; i++) {
            const line = this.memory.viewLine(i);
            console.log(`Memory Line ${i}: Data=${line}`);
        }
    }

    viewAddress(address) {
        const memLineIndex = Math.floor((address / wordsPerLine) % this.memory.lines);
        const offset = address % wordsPerLine;
        const cacheIndex = this.cache.getIndex(address);
        const tag = this.cache.getTag(address);
        
        return {
            address,
            memoryLine: memLineIndex,
            offset,
            cacheIndex,
            tag,
            inCache: this.cache.cache[cacheIndex].isCacheHit(tag),
            cacheValue: this.cache.cache[cacheIndex].isCacheHit(tag) ? 
                      this.cache.cache[cacheIndex].data[offset] : null,
            memoryValue: this.memory.data[memLineIndex][offset]
        };
    }

    getStats() {
        return {
            reads: this.readCount,
            writes: this.writeCount,
            cacheHits: this.cache.totalHits,
            cacheMisses: this.cache.totalMisses,
            hitRate: this.cache.totalHits / (this.cache.totalHits + this.cache.totalMisses) || 0
        };
    }
    
    getPendingRequests() {
        const pending = {};
        for (const [stage, request] of this.pendingRequests.entries()) {
            pending[stage] = request;
        }
        return pending;
    }
}

// Simulate the pipeline - simplified version
class Pipeline {
    constructor(memorySystem) {
        this.memory = memorySystem;
        this.cycleCount = 0;
        this.stallCount = 0;
        this.instructionCount = 0;
        this.stallReason = "";
    }
    
    // Simulate one clock cycle of the pipeline
    clock() {
        this.cycleCount++;
        console.log(`\n--- Clock Cycle ${this.cycleCount} ---`);
        
        // Process memory system
        const memoryProgress = this.memory.processCycle();
        
        // Check if the pipeline is stalled
        if (this.memory.pendingRequests.size > 0) {
            this.stallCount++;
            // Determine which stage is causing the stall
            let stages = Array.from(this.memory.pendingRequests.keys()).join(", ");
            this.stallReason = `Memory wait for stage(s): ${stages}`;
            console.log(`Pipeline stalled: ${this.stallReason}`);
        } else {
            this.instructionCount++;
            console.log("Pipeline advancing normally");
        }
        
        return {
            cycle: this.cycleCount,
            stalled: this.memory.pendingRequests.size > 0,
            stallReason: this.stallReason,
            pendingRequests: this.memory.getPendingRequests()
        };
    }
    
    getPerformanceStats() {
        return {
            cycles: this.cycleCount,
            instructions: this.instructionCount,
            stalls: this.stallCount,
            ipc: this.instructionCount / this.cycleCount,
            stallRate: (this.stallCount / this.cycleCount * 100).toFixed(2) + "%"
        };
    }
}

async function commandLineInterface() {
    const memSystem = new MemorySystem();
    const pipeline = new Pipeline(memSystem);

    console.log("Memory and Cache System with Pipeline Integration Demo");
    console.log("Configuration:");
    console.log(`- Cache Size: ${cacheSize} lines`);
    console.log(`- Words Per Line: ${wordsPerLine}`);
    console.log(`- Memory Size: ${memorySize} words`);
    console.log(`- Memory Delay: ${memoryDelay} cycles`);
    console.log(`- Cache Delay: ${cacheDelay} cycles`);
    console.log("\nCommands:");
    console.log("W <value> <address> <stage> : Write value to address from stage (M)");
    console.log("R <address> <stage> : Read from address from stage (F or M)");
    console.log("STEP <n> : Run pipeline for n cycles");
    console.log("VC <line> : View cache line");
    console.log("VM <line> : View memory line");
    console.log("VA <addr> : View address details");
    console.log("STATS : Show statistics");
    console.log("CACHE : Show entire cache");
    console.log("PERF : Show performance statistics");
    console.log("EXIT : Quit the program");

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });



    // Promisify readline.question
    function question(query) {
        return new Promise(resolve => rl.question(query, resolve));
    }

    rl.on('line', async (line) => {
        const [command, ...args] = line.split(" ");
        
        try {
            switch (command.toUpperCase()) {
                case 'W': {
                    const [value, address, stage] = args.map(arg => parseInt(arg) || arg);
                    if (isNaN(value) || isNaN(address) || !stage) {
                        console.log("Usage: W <value> <address> <stage>");
                        break;
                    }
                    const result = memSystem.write(address, value, stage);
                    console.log(result);
                    break;
                }
                case 'R': {
                    const [address, stage] = args.map(arg => parseInt(arg) || arg);
                    if (isNaN(address) || !stage) {
                        console.log("Usage: R <address> <stage>");
                        break;
                    }
                    const result = memSystem.read(address, stage);
                    console.log(result);
                    break;
                }
                case 'STEP': {
                    const cycles = parseInt(args[0]) || 1;
                    console.log(`Running pipeline for ${cycles} cycles...`);
                    for (let i = 0; i < cycles; i++) {
                        const result = pipeline.clock();
                        await sleep(200); // Short delay for visualization
                    }
                    break;
                }
                case 'VC': {
                    const lineIndex = parseInt(args[0]);
                    if (isNaN(lineIndex)) {
                        console.log("Usage: VC <line>");
                        break;
                    }
                    console.log(memSystem.viewCache(lineIndex));
                    break;
                }
                case 'VM': {
                    const lineIndex = parseInt(args[0]);
                    if (isNaN(lineIndex)) {
                        console.log("Usage: VM <line>");
                        break;
                    }
                    console.log(memSystem.viewMemory(lineIndex));
                    break;
                }
                case 'VA': {
                    const address = parseInt(args[0]);
                    if (isNaN(address)) {
                        console.log("Usage: VA <address>");
                        break;
                    }
                    console.log(memSystem.viewAddress(address));
                    break;
                }
                case 'STATS': {
                    const stats = memSystem.getStats();
                    console.log("\n--- Memory System Statistics ---");
                    console.log(`Total Reads: ${stats.reads}`);
                    console.log(`Total Writes: ${stats.writes}`);
                    console.log(`Cache Hits: ${stats.cacheHits}`);
                    console.log(`Cache Misses: ${stats.cacheMisses}`);
                    console.log(`Cache Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
                    break;
                }
                case 'CACHE': {
                    memSystem.viewEntireCache();
                    break;
                }
                case 'PERF': {
                    const perfStats = pipeline.getPerformanceStats();
                    console.log("\n--- Pipeline Performance ---");
                    console.log(`Total Cycles: ${perfStats.cycles}`);
                    console.log(`Instructions Completed: ${perfStats.instructions}`);
                    console.log(`Pipeline Stalls: ${perfStats.stalls}`);
                    console.log(`Instructions Per Cycle (IPC): ${perfStats.ipc.toFixed(2)}`);
                    console.log(`Stall Rate: ${perfStats.stallRate}`);
                    break;
                }
                case 'EXIT': {
                    console.log("Exiting...");
                    rl.close();
                    return;
                }
                default:
                    console.log('Unknown command. Type HELP for a list of commands.');
            }
        } catch (error) {
            console.error("Error executing command:", error.message);
        }
    });
}

commandLineInterface();
