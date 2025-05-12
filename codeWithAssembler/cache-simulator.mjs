// Configuration constants
const wordSizeBytes = 4;
const wordsPerLine = 16;
const cacheSize = 16; // Number of lines/sets in the cache
const memorySize = 32768; // Total size in words
const memoryDelay = 4; // Memory access delay in cycles
const cacheDelay = 1; // Cache access delay (hit) in cycles

// --- CacheLine Class ---
// Represents a single line in the cache
class CacheLine {
    constructor() {
        this.tag = -1;   // The tag part of the address stored in this line
        this.valid = 0;  // Valid bit (0=invalid, 1=valid)
        this.data = new Array(wordsPerLine).fill(0); // Data block (array of words)
    }

    // Updates the cache line with new tag and data (typically after a miss)
    updateCacheLine(tag, newData) {
        this.tag = tag;
        this.valid = 1; // Mark as valid
        // Ensure newData is an array of the correct size before copying
        if (Array.isArray(newData) && newData.length === wordsPerLine) {
            this.data = [...newData]; // Copy the new data block
        } else {
            console.error(`CacheLine Error: Invalid data provided for update. Expected array of size ${wordsPerLine}.`);
            // Optionally fill with zeros or handle error differently
            this.data.fill(0); // Fill with 0s as a fallback
        }
    }

    // Checks if the requested address tag matches the tag stored in this valid line
    isCacheHit(addressTag) {
        return (this.valid === 1) && (addressTag === this.tag);
    }
}

// --- Cache Class ---
// Represents the cache memory structure
class Cache {
    constructor() {
        // Initialize cache as an array of CacheLine objects
        this.cache = new Array(cacheSize).fill(null).map(() => new CacheLine());
        this.totalMisses = 0;
        this.totalHits = 0;
    }

    // Calculates the cache index (line number) for a given memory address
    getIndex(address) {
        if (address < 0) return -1; // Handle negative addresses if necessary
        // Index = (Address / WordsPerLine) mod CacheSize
        return Math.floor((address / wordsPerLine) % cacheSize);
    }

    // Calculates the tag part of a given memory address
    getTag(address) {
         if (address < 0) return -1;
         // Tag = Floor(Address / (WordsPerLine * CacheSize))
        return Math.floor(address / (wordsPerLine * cacheSize));
    }

    // Reads from the cache. Checks for hit/miss. Does NOT handle delays here.
    read(address) {
        const index = this.getIndex(address);
        const tag = this.getTag(address);
        // Offset within the cache line
        const offset = address % wordsPerLine;

        // Validate calculated index before accessing array
        if (index < 0 || index >= cacheSize) {
            console.error(`Cache Read Error: Invalid index ${index} calculated for address ${address}. Treating as miss.`);
            // Don't count stats here, MemorySystem decides based on overall operation
            return { hit: false, index: index, tag: tag, offset: offset, error: "Invalid address/index" };
        }

        const line = this.cache[index]; // Get the specific cache line

        // Safety check (should not happen with proper init)
        if (!line) {
             console.error(`Cache Read Error: Cache line at index ${index} is unexpectedly null. Treating as miss.`);
             return { hit: false, index: index, tag: tag, offset: offset, error: "Invalid cache line object" };
        }

        // Check for cache hit using the line's method
        if (line.isCacheHit(tag)) {
            // Cache Hit! Return hit status, data, and location info
            // Stats (totalHits) incremented by MemorySystem
            return { hit: true, data: line.data[offset], index: index, tag: tag, offset: offset };
        } else {
            // Cache Miss! Return miss status and location info
            // Stats (totalMisses) incremented by MemorySystem
            return { hit: false, index: index, tag: tag, offset: offset };
        }
    }

     // Writes to the cache (Write-Through policy assumed). Does NOT handle delays here.
     write(address, value) {
        const index = this.getIndex(address);
        const tag = this.getTag(address);
        const offset = address % wordsPerLine;

        // Validate index
        if (index < 0 || index >= cacheSize) {
            console.error(`Cache Write Error: Invalid index ${index} for address ${address}. Write ignored in cache.`);
            // Treat as a miss for statistics? MemorySystem decides based on policy.
            return { hit: false, error: "Invalid address/index" };
        }

        const line = this.cache[index];

        // Safety check
        if (!line) {
             console.error(`Cache Write Error: Cache line at index ${index} is null. Write ignored.`);
             return { hit: false, error: "Invalid cache line object" };
        }

        // Check for hit
        if (line.isCacheHit(tag)) {
            // Write Hit: Update the data in the cache line
            // console.log(`Cache: Write Hit - Updating Addr ${address} in cache line ${index}`);
            line.data[offset] = value; // Update the specific word
            // Stats incremented by MemorySystem
            return { hit: true }; // Signal hit
        } else {
             // Write Miss: For write-through, cache is typically NOT updated on write miss.
             // MemorySystem handles the write to main memory.
             // console.log(`Cache: Write Miss - Addr ${address}`);
            // Stats incremented by MemorySystem
            return { hit: false }; // Signal miss
        }
    }


    // Updates a specific cache line with new data (used after memory read on miss)
    updateLine(index, tag, lineData) {
        // Validate index before attempting update
        if (index >= 0 && index < cacheSize) {
            if (this.cache[index]) {
                // console.log(`Cache: Updating line ${index} with tag ${tag}`);
                this.cache[index].updateCacheLine(tag, lineData);
            } else {
                 console.error(`Cache UpdateLine Error: Cache line at index ${index} is null.`);
            }
        } else {
             console.error(`Cache UpdateLine Error: Invalid index ${index}.`);
        }
    }

    // Utility to view a specific cache line's content (for debugging)
    viewLine(lineIndex) {
        if (lineIndex < 0 || lineIndex >= cacheSize || !this.cache[lineIndex]) {
            return { error: "Invalid cache line index" };
        }
        const line = this.cache[lineIndex];
        return {
            tag: line.valid === 1 ? line.tag : "null", // Show tag only if valid
            valid: line.valid,
            data: [...line.data] // Return copy of data
        };
     }

    // Resets the cache to its initial state (all lines invalid)
    reset() {
        this.cache.forEach(line => {
             if(line) { // Check if line exists before resetting
                 line.tag = -1;
                 line.valid = 0;
                 line.data.fill(0);
             }
        });
        this.totalMisses = 0;
        this.totalHits = 0;
        console.log("Cache reset.");
    }
}


// --- Memory Class ---
// Represents the main memory, handles access delay simulation
class Memory {
    constructor() {
        // Calculate number of lines based on memory size and words per line
        this.lines = Math.floor(memorySize / wordsPerLine);
        // Basic validation for memory configuration
        if (this.lines <= 0) {
            throw new Error(`Invalid memory configuration: memorySize=${memorySize}, wordsPerLine=${wordsPerLine} results in ${this.lines} lines.`);
        }
        // Initialize memory data structure (array of lines, where each line is array of words)
        this.data = new Array(this.lines).fill(null).map(() => new Array(wordsPerLine).fill(0));
        // Memory access delay parameters
        this.delay = memoryDelay; // Configured delay cycles
        this.count = 0;           // Remaining delay counter for current operation
        this.servingStage = null; // Which pipeline stage initiated the current operation
        // Details of the pending operation
        this.pendingOperation = null; // { type: 'read'/'write', address: number, value?: number, stage: string, result?: object }
    }

    // Calculates the memory line index and offset within the line for an address
    getLineAndOffset(address) {
         // Check if address is within the valid memory range (0 to memorySize-1)
         if (address < 0 || address >= memorySize) {
             return { lineIndex: -1, offset: -1, error: `Address ${address} out of bounds (0-${memorySize - 1})` };
         }
        // Calculate line index and offset
        const lineIndex = Math.floor(address / wordsPerLine);
        const offset = address % wordsPerLine;
        // Additional check (should not fail if memorySize/wordsPerLine is correct)
        if (lineIndex < 0 || lineIndex >= this.lines) {
            return { lineIndex: -1, offset: -1, error: `Calculated lineIndex ${lineIndex} out of bounds (0-${this.lines - 1})` };
        }
        return { lineIndex, offset }; // Return valid indices
    }

    // Simulates one clock cycle of memory delay processing
    // Returns true if an operation completed this cycle, false otherwise
    processCycle() {
        if (this.count > 0) { // If an operation is pending
            this.count--; // Decrement delay counter
            // console.log(`Memory: Delay countdown: ${this.count} cycles remaining for ${this.servingStage || 'unknown stage'}`);
            if (this.count === 0 && this.pendingOperation) { // Delay finished, complete the operation
                const { type, address, value, stage } = this.pendingOperation;
                const { lineIndex, offset, error } = this.getLineAndOffset(address);

                // Check if address was valid for the operation completion
                if (error || lineIndex === -1) {
                     console.error(`Memory Error on completion: Invalid address ${address}. Operation failed.`);
                     // Store error status in the pending operation result
                     this.pendingOperation.result = { status: "error", message: error || "Invalid address" };
                }
                else if (type === 'read') {
                    // Perform the read from memory data structure
                    const readData = this.data[lineIndex][offset];
                    const lineData = [...this.data[lineIndex]]; // Get a copy of the entire line for cache update
                    // Store success status and data in the result
                     this.pendingOperation.result = { status: "done", data: readData, line: lineData };
                     // console.log(`Memory: Read complete for ${stage}. Addr=${address}, Value=${readData}`);
                } else { // type === 'write'
                    // Perform the write to memory data structure
                    this.data[lineIndex][offset] = value;
                    // Store success status in the result
                     this.pendingOperation.result = { status: "done" };
                    // console.log(`Memory: Write complete for ${stage}. Addr=${address}, Value=${value}`);
                }
                return true; // Operation finished (successfully or with error)
            }
        }
        return false; // Operation still pending or memory is idle
    }

    // Initiates a read request from a specific pipeline stage
    requestRead(address, stage) {
        // Check if memory is already busy with another operation
        if (this.count > 0) {
            // console.log(`Memory: Busy, cannot start read for ${stage} yet.`);
            return { status: "busy" };
        }

        // Validate the address before starting operation
         const { lineIndex, offset, error } = this.getLineAndOffset(address);
         if (error || lineIndex === -1) {
             console.error(`Memory Read Request Error: Invalid address ${address} for stage ${stage}.`);
             return { status: "error", message: error || "Invalid address" };
         }

        // Start the read operation and delay
        this.count = this.delay; // Set delay counter
        this.servingStage = stage; // Record requesting stage
        // Store operation details
        this.pendingOperation = { type: "read", address: address, stage: stage, result: null };
        // console.log(`Memory: Starting read request for ${stage}. Addr=${address}, Delay=${this.delay}`);
        // Handle case of zero delay (completes instantly)
         if (this.delay === 0) {
             this.count = 0; // Ensure count is 0
             // Process immediately in the next cycle or handle completion logic here if required
             return { status: "pending", immediate: true }; // Signal potential immediate completion
         }
        return { status: "pending" }; // Signal operation is pending
    }

    // Initiates a write request from a specific pipeline stage
    requestWrite(address, value, stage) {
        // Check if busy
        if (this.count > 0) {
            // console.log(`Memory: Busy, cannot start write for ${stage} yet.`);
            return { status: "busy" };
        }

        // Validate address
        const { lineIndex, offset, error } = this.getLineAndOffset(address);
        if (error || lineIndex === -1) {
            console.error(`Memory Write Request Error: Invalid address ${address} for stage ${stage}.`);
            return { status: "error", message: error || "Invalid address" };
        }

        // Start write operation and delay
        this.count = this.delay;
        this.servingStage = stage;
        this.pendingOperation = { type: "write", address: address, value: value, stage: stage, result: null };
        // console.log(`Memory: Starting write request for ${stage}. Addr=${address}, Value=${value}, Delay=${this.delay}`);
         if (this.delay === 0) {
             this.count = 0;
             return { status: "pending", immediate: true };
         }
        return { status: "pending" };
    }

    // Checks if memory is busy serving a specific stage
    isBusyForStage(stage) {
        // True if counter > 0 AND the operation belongs to the specified stage
        return this.count > 0 && this.servingStage === stage;
    }

     // Checks if memory is busy at all (serving any stage)
     isBusy() {
        return this.count > 0;
     }

    // Gets the result of the completed operation for the given stage
    // Returns the result object if complete and matches stage, otherwise null
    getResult(stage) {
        if (this.count === 0 && this.pendingOperation && this.pendingOperation.stage === stage && this.pendingOperation.result) {
            return this.pendingOperation.result;
        }
        return null;
    }

    // Clears the operation state after result is retrieved by the MemorySystem
    // Should only be called by MemorySystem after getResult confirms completion
    clearOperation(stage) {
         if (this.count === 0 && this.pendingOperation && this.pendingOperation.stage === stage) {
            // console.log(`Memory: Clearing completed operation for ${stage}`);
            this.servingStage = null;
            this.pendingOperation = null;
         } else if (this.pendingOperation && this.pendingOperation.stage === stage) {
              // console.warn(`Memory: ClearOperation called for ${stage} but count is ${this.count}`);
         }
    }

    // Utility to view memory line content (for debugging)
    viewLine(lineIndex) {
         if (lineIndex < 0 || lineIndex >= this.lines) {
             return { error: "Invalid memory line index" };
         }
         return [...this.data[lineIndex]]; // Return copy
     }

     // Resets memory state
     reset() {
        // Zero out all memory lines
        this.data.forEach(line => line.fill(0));
        // Reset delay and pending operation state
        this.count = 0;
        this.servingStage = null;
        this.pendingOperation = null;
        console.log("Memory reset.");
     }
}


// --- MemorySystem Class ---
// Orchestrates interactions between Cache and Memory, manages delays and results
export class MemorySystem {
    constructor() {
        this.cache = new Cache();
        this.memory = new Memory();
        // Basic access counters
        this.readCount = 0;
        this.writeCount = 0;

        // State for simulating CACHE HIT access delay
        this.cacheDelay = cacheDelay; // Configured cache hit delay
        this.cacheCount = 0;          // Remaining cache delay counter
        this.cacheServingStage = null; // Stage being served by cache delay unit
        this.cachePendingOp = null;  // Details of op waiting for cache delay { type:'read'/'write', address, stage, data?, result? }

         // Map to store completed operation results for pipeline stages to retrieve
        this.stageResults = new Map(); // key=stageName, value={ status: 'done'/'error', data?, source?, message? }
    }

    // Simulates one clock cycle for both cache and memory delay processing
    // Returns true if any operation (cache hit delay or memory access) completed this cycle
    processCycle() {
        let cacheProgress = false; // Did cache hit delay complete?
        let memoryProgress = false; // Did memory operation complete?

        // 1. Process Cache Hit Delay (if active)
        if (this.cacheCount > 0) {
            this.cacheCount--; // Decrement cache delay counter
            // console.log(`MemorySystem: Cache delay countdown: ${this.cacheCount} for ${this.cacheServingStage}`);
            if (this.cacheCount === 0 && this.cachePendingOp) { // Cache hit delay finished
                 const op = this.cachePendingOp;
                 // console.log(`MemorySystem: Cache ${op.type} access complete for ${op.stage}. Addr=${op.address}`);
                 // Store the result (data from cache hit) for the pipeline stage
                 this.stageResults.set(op.stage, { status: "done", data: op.data, source: "cache" });
                 // Clear cache delay state
                 this.cacheServingStage = null;
                 this.cachePendingOp = null;
                 cacheProgress = true; // Cache access completed this cycle
            }
        }

        // 2. Process Memory Delay (call Memory's processCycle)
        memoryProgress = this.memory.processCycle();
        if (memoryProgress) { // Memory operation finished this cycle
             const memOp = this.memory.pendingOperation; // Get details of the completed memory op
             if (memOp) {
                const memResult = memOp.result; // Get result stored by memory.processCycle

                // Handle memory error propagation
                if (memResult.status === "error") {
                     this.stageResults.set(memOp.stage, { status: "error", message: memResult.message, source: "memory" });
                     console.error(`MemorySystem: Error during memory operation for stage ${memOp.stage}: ${memResult.message}`);
                }
                // Handle successful memory read (cache miss fill)
                else if (memOp.type === 'read') {
                     // Update the cache line with data read from memory
                     const cacheCheck = this.cache.read(memOp.address); // Get index/tag again for safety
                     if (!cacheCheck.error) { // Update cache only if address was valid for cache
                         this.cache.updateLine(cacheCheck.index, cacheCheck.tag, memResult.line);
                     } else {
                          console.warn(`MemorySystem: Memory read for addr ${memOp.address} complete, but cache index invalid. Cache not updated.`);
                     }
                     // Store the final result (single data word) for the pipeline stage
                     this.stageResults.set(memOp.stage, { status: "done", data: memResult.data, source: "memory" });
                 }
                 // Handle successful memory write
                 else if (memOp.type === 'write') {
                      // Signal write completion to the pipeline stage
                      this.stageResults.set(memOp.stage, { status: "done", source: "memory" });
                 }
             } else {
                  console.warn("MemorySystem: Memory made progress but pendingOperation was null.");
             }
             // Note: Memory state (pendingOperation) is cleared via getResult/clearOperation below
        }

        return cacheProgress || memoryProgress; // Return true if anything completed
    }

    // Pipeline calls this to read data for a specific stage
    read(address, stage) {
        this.readCount++; // Increment read counter
        // console.log(`MemorySystem: Read request from ${stage} for Addr ${address}`);

        // Check if the requesting stage is already busy/waiting
        if (this.isBusyForStage(stage)) {
             // console.log(`MemorySystem: ${stage} is already waiting or another stage is busy.`);
             return { status: "wait" }; // Tell pipeline to wait
        }

        // 1. Check Cache
        const cacheResult = this.cache.read(address);
        // Handle potential error from cache read (invalid address/index)
         if (cacheResult.error) {
             console.error(`MemorySystem: Cache Read Error for stage ${stage}: ${cacheResult.error}`);
             // Immediately store error result for the stage
             this.stageResults.set(stage, { status: "error", message: cacheResult.error, source: "cache" });
             return { status: "error", message: cacheResult.error }; // Return error status to pipeline
         }

        // 2. Process Cache Hit
        if (cacheResult.hit) {
            this.cache.totalHits++; // Increment hit counter
            // console.log(`MemorySystem: Cache Hit for ${stage}. Addr ${address}.`);
            // Simulate cache hit delay if configured
             if (this.cacheDelay > 0) {
                 // Check if cache delay unit is already busy
                 if (this.cacheCount > 0) {
                     // console.log(`MemorySystem: Cache delay unit busy, ${stage} must wait.`);
                     return { status: "busy" }; // Another stage is using cache delay unit
                 }
                 // Start cache delay simulation
                 this.cacheCount = this.cacheDelay;
                 this.cacheServingStage = stage;
                 this.cachePendingOp = { type: 'read', address, stage, data: cacheResult.data }; // Store data for result
                 // console.log(`MemorySystem: Starting cache read delay (${this.cacheDelay}) for ${stage}.`);
                 return { status: "wait" }; // Tell pipeline to wait for cache delay
             } else { // No cache delay (cacheDelay = 0)
                 // Store result immediately and return done
                 this.stageResults.set(stage, { status: "done", data: cacheResult.data, source: "cache" });
                 return { status: "done", data: cacheResult.data, source: "cache" }; // Operation complete
             }
        }
        // 3. Process Cache Miss
        else {
            this.cache.totalMisses++; // Increment miss counter
            // console.log(`MemorySystem: Cache Miss for ${stage}. Addr ${address}. Requesting from Memory.`);
            // Request read from main memory
            const memRequestStatus = this.memory.requestRead(address, stage);

            // Handle status returned by memory request
            if (memRequestStatus.status === "error") {
                 console.error(`MemorySystem: Memory Read Error for stage ${stage}: ${memRequestStatus.message}`);
                 this.stageResults.set(stage, { status: "error", message: memRequestStatus.message, source: "memory" });
                 return { status: "error", message: memRequestStatus.message }; // Return error to pipeline
            } else if (memRequestStatus.status === "busy") {
                 // console.log(`MemorySystem: Memory busy, ${stage} must wait.`);
                 // Memory is busy with another stage's request
                 return { status: "busy" }; // Tell pipeline it's busy
            } else { // status === "pending"
                 // Memory request accepted, waiting for memory delay
                 // console.log(`MemorySystem: Memory read pending for ${stage}.`);
                 return { status: "wait" }; // Tell pipeline to wait
            }
        }
    }

    // Pipeline calls this for write (Write-Through, No Write-Allocate assumed)
    write(address, value, stage) {
        this.writeCount++; // Increment write counter
        // console.log(`MemorySystem: Write request from ${stage} for Addr ${address}, Value ${value}`);

         // Check if the requesting stage is already busy/waiting
         if (this.isBusyForStage(stage)) {
             // console.log(`MemorySystem: ${stage} is already waiting or another stage is busy.`);
             return { status: "wait" }; // Tell pipeline to wait
         }

        // 1. Write to Cache (if hit) - Part of Write-Through
        const cacheWriteResult = this.cache.write(address, value);
        // Handle potential error from cache write (invalid address/index)
         if (cacheWriteResult.error) {
             console.error(`MemorySystem: Cache Write Error for stage ${stage}: ${cacheWriteResult.error}`);
             // Policy decision: Does write fail entirely if cache address is bad? Assume yes.
             this.stageResults.set(stage, { status: "error", message: cacheWriteResult.error, source: "cache" });
             return { status: "error", message: cacheWriteResult.error }; // Return error to pipeline
         }
         // Update cache stats based on hit/miss
         if(cacheWriteResult.hit) { this.cache.totalHits++; } else { this.cache.totalMisses++; }


        // 2. Write to Memory (Always for Write-Through)
        // console.log(`MemorySystem: Requesting memory write for ${stage}. Addr ${address}.`);
        const memRequestStatus = this.memory.requestWrite(address, value, stage);

        // Handle status returned by memory request
        if (memRequestStatus.status === "error") {
             console.error(`MemorySystem: Memory Write Error for stage ${stage}: ${memRequestStatus.message}`);
             this.stageResults.set(stage, { status: "error", message: memRequestStatus.message, source: "memory" });
             return { status: "error", message: memRequestStatus.message }; // Return error to pipeline
        } else if (memRequestStatus.status === "busy") {
            // console.log(`MemorySystem: Memory busy, ${stage} must wait for write.`);
            return { status: "busy" }; // Tell pipeline memory is busy
        } else { // status === "pending"
            // Memory write request accepted, waiting for memory delay
            // console.log(`MemorySystem: Memory write pending for ${stage}.`);
            return { status: "wait" }; // Tell pipeline to wait
        }
    }

     // --- Status Check Methods used by Pipeline ---

     // Checks if the system is busy in a way that prevents 'stage' from proceeding.
     // This means:
     // - Cache delay unit busy with *another* stage.
     // - Memory busy with *another* stage.
     // - OR *this* stage is currently waiting for cache delay or memory access.
     isBusyForStage(stage) {
        const cacheBusyOther = this.cacheCount > 0 && this.cacheServingStage !== stage;
        const memoryBusyOther = this.memory.isBusy() && this.memory.servingStage !== stage;
        const stageWaitingCache = this.cacheCount > 0 && this.cacheServingStage === stage;
        const stageWaitingMemory = this.memory.isBusyForStage(stage);

        return cacheBusyOther || memoryBusyOther || stageWaitingCache || stageWaitingMemory;
     }

     // Checks specifically if 'stage' has an operation pending (waiting for cache or memory).
     // Used by pipeline to know if MEM stage should stall.
     hasPendingRequest(stage) {
         const waitingCache = this.cacheCount > 0 && this.cacheServingStage === stage;
         const waitingMemory = this.memory.isBusyForStage(stage);
         return waitingCache || waitingMemory;
     }

     // Gets the result if an operation for 'stage' finished *this cycle*.
     // Checks both memory completion and cache delay completion.
     // Consumes the result (clears relevant state). Returns null if no result ready.
     getRequestResult(stage) {
         // Check memory completion first
         let result = this.memory.getResult(stage);
         if (result) {
             // CRITICAL: Clear the memory operation state AFTER successfully getting the result.
             this.memory.clearOperation(stage);
             // console.log(`MemorySystem: Got result from Memory for ${stage}`);
             return { ...result, source: "memory" }; // Add source info and return
         }

         // Check cache hit delay completion (stored in stageResults map)
         if (this.stageResults.has(stage)) {
             result = this.stageResults.get(stage);
             // Consume the result from the map
             this.stageResults.delete(stage);
             // console.log(`MemorySystem: Got result from stageResults map (cache) for ${stage}`);
             return result;
         }

         return null; // No result ready for this stage this cycle
     }

     // Method to explicitly clear a stage's result map entry (if needed)
     // Generally not required if getRequestResult consumes results properly.
     clearRequestResult(stage) {
         this.stageResults.delete(stage);
         // Maybe also check/clear memory just in case?
         if (this.memory.getResult(stage)) {
             this.memory.clearOperation(stage);
         }
     }

    // --- Utility Methods ---

    // Returns a snapshot of memory content (e.g., first N words)
    getMemorySnapshot(startAddr = 0, count = 64) {
         const snapshot = {};
         // Ensure endAddr doesn't exceed memory bounds
         const endAddr = Math.min(startAddr + count, memorySize);
         for (let addr = startAddr; addr < endAddr; addr++) {
              // Get line and offset, handle potential errors (invalid address)
              const { lineIndex, offset, error } = this.memory.getLineAndOffset(addr);
              if (!error && lineIndex !== -1) {
                 // Read directly from memory data structure
                 snapshot[addr] = this.memory.data[lineIndex][offset];
              } else {
                  snapshot[addr] = 'ERR'; // Indicate invalid address in snapshot
              }
         }
         return snapshot;
      }

    // Returns cache statistics
    getStats() {
        const totalAccesses = this.cache.totalHits + this.cache.totalMisses;
        return {
            reads: this.readCount,
            writes: this.writeCount,
            cacheHits: this.cache.totalHits,
            cacheMisses: this.cache.totalMisses,
            hitRate: totalAccesses === 0 ? 0 : (this.cache.totalHits / totalAccesses) // Calculate hit rate
        };
     }

    // View specific cache line
    viewCache(lineIndex) { return this.cache.viewLine(lineIndex); }
    // View specific memory line
    viewMemory(lineIndex) { return this.memory.viewLine(lineIndex); }

    // Resets the entire memory system (cache, memory, counters, state)
    reset() {
        this.cache.reset(); // Reset cache component
        this.memory.reset(); // Reset memory component
        // Reset MemorySystem state
        this.readCount = 0;
        this.writeCount = 0;
        this.cacheCount = 0;
        this.cacheServingStage = null;
        this.cachePendingOp = null;
        this.stageResults.clear(); // Clear any leftover results
        console.log("MemorySystem reset.");
    }
}