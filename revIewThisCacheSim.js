const wordSizeBytes = 4; // 32 bits
const wordsPerLine = 16;
const lineSizeBytes = wordSizeBytes * wordsPerLine;
const cacheSize = 16;
const memorySize = 32768; // 32K words
const memoryDelay = 4; // Memory access delay in cycles

// Cache line representation
class CacheLine {
    constructor() {
        this.tag = -1; // Use -1 instead of null (better for numeric comparisons)
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

// Cache implementation
class Cache {
    constructor() {
        this.cache = new Array(cacheSize).fill().map(() => new CacheLine());
        this.totalMisses = 0;
        this.totalHits = 0;
    }

    // Get cache line index from address (direct-mapped cache)
    getIndex(address) {
        return Math.floor((address / wordsPerLine) % cacheSize);
    }

    // Get tag from address
    getTag(address) {
        return Math.floor(address / wordsPerLine / cacheSize);
    }

    // Read from cache
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

    // View cache line
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

// Memory implementation
class Memory {
    constructor() {
        this.lines = Math.floor(memorySize / wordsPerLine);
        this.data = new Array(this.lines).fill().map(() => new Array(wordsPerLine).fill(0));
        this.delay = memoryDelay;
        this.count = 0;
        this.servingStage = null;
        this.pendingOperation = null;
    }

    // Get line index and offset from address
    getLineAndOffset(address) {
        const lineIndex = Math.floor((address / wordsPerLine) % this.lines);
        const offset = address % wordsPerLine;
        return { lineIndex, offset };
    }

    // Read from memory
    read(address, stage) {
        if (this.count > 0) {
            // Memory is busy
            if (stage === this.servingStage) {
                this.count--;
                console.log(`Memory still busy: ${this.count} cycles remaining for ${stage}`);
                if (this.count === 0) {
                    // Operation complete
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
            // Start new read operation
            this.count = this.delay;
            this.servingStage = stage;
            this.pendingOperation = { type: "read", address };
            console.log(`Starting memory read: addr=${address}, stage=${stage}, delay=${this.delay}`);
            return { status: "wait", remainingCycles: this.count };
        }
    }

    // Write to memory
    write(address, value, stage) {
        if (this.count > 0) {
            // Memory is busy
            if (stage === this.servingStage) {
                this.count--;
                console.log(`Memory still busy: ${this.count} cycles remaining for ${stage}`);
                if (this.count === 0) {
                    // Operation complete
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

    // View memory line
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
        this.operationQueue = []; // Queue for pending operations
    }

    // Process one clock cycle
    processCycle() {
        if (this.operationQueue.length === 0) {
            return null; // No operations pending
        }

        const operation = this.operationQueue[0];
        let result;

        if (operation.type === 'read') {
            result = this.processRead(operation.address, operation.stage);
        } else if (operation.type === 'write') {
            result = this.processWrite(operation.address, operation.value, operation.stage);
        }

        if (result.status === 'done') {
            this.operationQueue.shift(); // Remove completed operation
            return result;
        }
        
        return { status: 'wait', operation: operation, remainingCycles: result.remainingCycles };
    }

    // Queue a read operation
    read(address, stage) {
        this.readCount++;
        
        // Try to read from cache first
        const cacheResult = this.cache.read(address);
        
        if (cacheResult.hit) {
            // Cache hit - return immediately
            console.log(`Cache hit for address ${address}`);
            return { status: "done", data: cacheResult.data, source: "cache" };
        } else {
            // Cache miss - queue memory read
            console.log(`Cache miss for address ${address}, queuing memory read`);
            this.operationQueue.push({ type: 'read', address, stage });
            return { status: "wait", message: "Memory access queued" };
        }
    }

    // Process a pending read operation
    processRead(address, stage) {
        // Cache miss - fetch from memory
        const memResult = this.memory.read(address, stage);
        
        if (memResult.status === "done") {
            // Memory read complete, update cache and return data
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
            // Memory still processing
            return { status: "wait", remainingCycles: memResult.remainingCycles };
        }
    }

    // Separate function for write-through operation
    writeThrough(address, value, stage) {
        this.writeCount++;
        
        // Update cache if the address is present
        const index = this.cache.getIndex(address);
        const tag = this.cache.getTag(address);
        const offset = address % wordsPerLine;
        
        if (this.cache.cache[index].isCacheHit(tag)) {
            // Update cache directly
            this.cache.cache[index].data[offset] = value;
            this.cache.totalHits++;
            console.log(`Cache hit: Updated address ${address} with value ${value} in cache`);
        } else {
            this.cache.totalMisses++;
            console.log(`Cache miss for address ${address} during write-through`);
        }
        
        // Queue memory write
        console.log(`Queuing write to address ${address} with value ${value}`);
        this.operationQueue.push({ type: 'write', address, value, stage });
        
        return { status: "wait", message: "Memory write queued" };
    }

    // Queue a write operation (now separate from write-through)
    write(address, value, stage) {
        this.writeCount++;
        
        // Queue memory write
        console.log(`Queuing write to address ${address} with value ${value}`);
        this.operationQueue.push({ type: 'write', address, value, stage });
        
        return { status: "wait", message: "Memory write queued" };
    }

    // Process a pending write operation
    processWrite(address, value, stage) {
        const memResult = this.memory.write(address, value, stage);
        
        if (memResult.status === "done") {
            // Memory write complete
            console.log(`Memory write complete for address ${address} with value ${value}`);
            
            return { 
                status: "done", 
                message: `Write complete: Value ${value} written to address ${address}`
            };
        } else {
            // Memory still processing
            return { status: "wait", remainingCycles: memResult.remainingCycles };
        }
    }

    // View cache line
    viewCache(lineIndex) {
        return this.cache.viewLine(lineIndex);
    }

    // View memory line
    viewMemory(lineIndex) {
        return this.memory.viewLine(lineIndex);
    }

    // View all cache lines
    viewEntireCache() {
        console.log("\n--- Entire Cache State ---");
        for (let i = 0; i < cacheSize; i++) {
            const line = this.cache.viewLine(i);
            console.log(`Cache Line ${i}: Valid=${line.valid}, Tag=${line.tag}, Data=${line.data}`);
        }
    }

    // View entire memory (optional, if needed for demo)
    viewEntireMemory() {
        console.log("\n--- Entire Memory State ---");
        for (let i = 0; i < this.memory.lines; i++) {
            const line = this.memory.viewLine(i);
            console.log(`Memory Line ${i}: Data=${line}`);
        }
    }

    // View address in both cache and memory
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

    // Get statistics
    getStats() {
        return {
            reads: this.readCount,
            writes: this.writeCount,
            cacheHits: this.cache.totalHits,
            cacheMisses: this.cache.totalMisses,
            hitRate: this.cache.totalHits / (this.cache.totalHits + this.cache.totalMisses) || 0
        };
    }
}

// Demo function to show how memory simulator works with realistic timing
/* async function runTimingDemo() {
    const memSystem = new MemorySystem();
    const sleepTime = 1000; // 1 second for each wait cycle
    
    console.log("Starting memory simulator timing demo...");
    console.log("All cache lines are initially empty and invalid.");
    
    // Function to simulate a delay
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // View initial state
    console.log("\n--- Initial Cache State ---");
    for (let i = 0; i < 3; i++) {
        const line = memSystem.viewCache(i);
        console.log(`Cache Line ${i}: Valid=${line.valid}, Tag=${line.tag}`);
    }
    
    // First write operation to address 0 - using writeThrough
    console.log("\n--- Write value 42 to address 0 using writeThrough ---");
    let writeResult = memSystem.writeThrough(0, 42, "main");
    console.log("Initial write result:", writeResult);
    
    // Process cycles until write completes
    let cycleNum = 1;
    let result;
    do {
        await sleep(sleepTime);
        result = memSystem.processCycle();
        console.log(`Cycle ${cycleNum++}: ${result ? result.status : 'no operation'}`);
    } while (result && result.status === 'wait');
    
    console.log("Write operation complete");
    
    // Read the value back
    console.log("\n--- Read from address 0 (should be in cache) ---");
    let readResult = memSystem.read(0, "main");
    console.log("Read result:", readResult);
    
    // Write to a different address in the same cache line
    console.log("\n--- Write value 100 to address 16 (same cache line as address 0) using writeThrough ---");
    writeResult = memSystem.writeThrough(16, 100, "main");
    console.log("Initial write result:", writeResult);
    
    // Process cycles until write completes
    cycleNum = 1;
    do {
        await sleep(sleepTime);
        result = memSystem.processCycle();
        console.log(`Cycle ${cycleNum++}: ${result ? result.status : 'no operation'}`);
    } while (result && result.status === 'wait');
    
    // View cache state after operations
    console.log("\n--- Cache State After Operations ---");
    for (let i = 0; i < 3; i++) {
        const line = memSystem.viewCache(i);
        console.log(`Cache Line ${i}: Valid=${line.valid}, Tag=${line.tag}`);
    }
    
    // Read from a different address that will cause a cache miss
    console.log("\n--- Read from address 256 (should be a cache miss) ---");
    readResult = memSystem.read(256, "main");
    console.log("Initial read result:", readResult);
    
    // Process cycles until read completes
    cycleNum = 1;
    do {
        await sleep(sleepTime);
        result = memSystem.processCycle();
        console.log(`Cycle ${cycleNum++}: ${result ? result.status : 'no operation'}`);
    } while (result && result.status === 'wait');
    
    console.log("Read operation complete, data:", result.data);
    
    // View cache state after all operations
    console.log("\n--- Final Cache State ---");
    for (let i = 0; i < 3; i++) {
        const line = memSystem.viewCache(i);
        console.log(`Cache Line ${i}: Valid=${line.valid}, Tag=${line.tag}`);
    }
    
    // View statistics
    const stats = memSystem.getStats();
    console.log("\n--- Memory System Statistics ---");
    console.log(`Total Reads: ${stats.reads}`);
    console.log(`Total Writes: ${stats.writes}`);
    console.log(`Cache Hits: ${stats.cacheHits}`);
    console.log(`Cache Misses: ${stats.cacheMisses}`);
    console.log(`Cache Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
}

// Run the timing demo
runTimingDemo(); */


// Demo function to show how memory simulator works with realistic timing
async function commandLineInterface() {

    const memSystem = new MemorySystem();

    console.log("Memory and Cache System Interactive Demo");

    console.log("Enter commands: 'W value address stage', 'R address stage', 'V level line'");

    console.log("Type 'exit' to quit.");

 

    const sleepTime = 1000; // 1 second per cycle

 

    function sleep(ms) {

        return new Promise(resolve => setTimeout(resolve, ms));

    }

 

    // Example input parsing loop

    const readline = require('readline');

    const rl = readline.createInterface({

        input: process.stdin,

        output: process.stdout

    });

 

    rl.on('line', async (line) => {

        const [command, ...args] = line.split(" ");

        let result;

       

        switch (command.toUpperCase()) {

            case 'W':

                const [value, address, stage] = args.map(arg => parseInt(arg) || arg);

                result = memSystem.writeThrough(address, value, stage);

                break;

            case 'R':

                const [rAddress, rStage] = args.map(arg => parseInt(arg) || arg);

                result = memSystem.read(rAddress, rStage);

                break;

            case 'V':

                const [level, lineIndex] = args.map(arg => parseInt(arg) || arg);

                if (level === 1) {

                    console.log(memSystem.viewCache(lineIndex));

                } else if (level === 0) {

                    console.log(memSystem.viewMemory(lineIndex));

                } else {

                    console.log('Invalid level');

                }

                break;

            case 'EXIT':

                rl.close();

                return;

            default:

                console.log('Unknown command');

        }

       

        while (result && result.status === 'wait') {

            await sleep(sleepTime);

            result = memSystem.processCycle();

        }

       

        if (result && result.status === 'done') {

            console.log(result);

        }

    });

}

 

commandLineInterface();
