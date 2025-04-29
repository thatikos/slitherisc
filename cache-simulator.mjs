// cache-simulator.mjs

// Configuration constants
const wordSizeBytes = 4; // 32 bits
const wordsPerLine = 16;
const cacheSize = 16;
const memorySize = 32768; // 32K words
const memoryDelay = 1; // Reduced memory access delay for simulator responsiveness
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

export class Cache {
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
            tag: this.cache[lineIndex].tag,
            valid: this.cache[lineIndex].valid,
            data: [...this.cache[lineIndex].data]
        };
    }
}

export class Memory {
    constructor() {
        this.lines = Math.floor(memorySize / wordsPerLine);
        this.data = new Array(this.lines).fill().map(() => new Array(wordsPerLine).fill(0));
    }

    getLineAndOffset(address) {
        const lineIndex = Math.floor(address / wordsPerLine);
        const offset = address % wordsPerLine;
        return { lineIndex, offset };
    }

    read(address) {
        const { lineIndex, offset } = this.getLineAndOffset(address);
        
        if (lineIndex >= 0 && lineIndex < this.lines) {
            return { status: "done", data: this.data[lineIndex][offset] };
        }
        
        return { status: "error", message: "Invalid memory address" };
    }

    write(address, value) {
        const { lineIndex, offset } = this.getLineAndOffset(address);
        
        if (lineIndex >= 0 && lineIndex < this.lines) {
            this.data[lineIndex][offset] = value;
            return { status: "done" };
        }
        
        return { status: "error", message: "Invalid memory address" };
    }

    viewLine(lineIndex) {
        if (lineIndex < 0 || lineIndex >= this.lines) {
            return [];
        }
        return [...this.data[lineIndex]];
    }
}

// Memory system that combines cache and main memory
export class MemorySystem {
    constructor() {
        this.cache = new Cache();
        this.memory = new Memory();
        this.readCount = 0;
        this.writeCount = 0;
        this.cacheEnabled = false;
    }

    enableCache(enabled) {
        this.cacheEnabled = enabled;
        console.log(`Cache mode: ${enabled ? 'enabled' : 'disabled'}`);
    }

    reset() {
        this.cache = new Cache();
        this.memory = new Memory();
        this.readCount = 0;
        this.writeCount = 0;
    }

    read(address, stage) {
        this.readCount++;
        
        // If cache is disabled, go directly to memory
        if (!this.cacheEnabled) {
            const memResult = this.memory.read(address);
            return memResult;
        }
        
        // Check cache first
        const cacheResult = this.cache.read(address);
        
        if (cacheResult.hit) {
            return { status: "done", data: cacheResult.data, source: "cache" };
        } else {
            // Cache miss - read from memory
            const memResult = this.memory.read(address);
            
            if (memResult.status === "done") {
                // Update cache with this data
                const { lineIndex, offset } = this.memory.getLineAndOffset(address);
                const tag = this.cache.getTag(address);
                const index = this.cache.getIndex(address);
                
                // Get the whole memory line
                const memLine = [...this.memory.data[lineIndex]];
                
                // Update cache
                this.cache.cache[index].updateCacheLine(tag, memLine);
                
                return { 
                    status: "done", 
                    data: memResult.data, 
                    source: "memory"
                };
            }
            
            return memResult;
        }
    }

    write(address, value) {
        this.writeCount++;
        
        // Write to memory
        const memResult = this.memory.write(address, value);
        
        // If cache is enabled, update cache if applicable
        if (this.cacheEnabled) {
            const index = this.cache.getIndex(address);
            const tag = this.cache.getTag(address);
            const offset = address % wordsPerLine;
            
            if (this.cache.cache[index].isCacheHit(tag)) {
                // Update cache line
                this.cache.cache[index].data[offset] = value;
                this.cache.totalHits++;
            } else {
                // Read the whole line from memory and update cache
                const { lineIndex } = this.memory.getLineAndOffset(address);
                const memLine = [...this.memory.data[lineIndex]];
                
                this.cache.cache[index].updateCacheLine(tag, memLine);
                this.cache.totalMisses++;
            }
        }
        
        return memResult;
    }

    getStats() {
        const totalAccesses = this.cache.totalHits + this.cache.totalMisses;
        return {
            reads: this.readCount,
            writes: this.writeCount,
            cacheHits: this.cache.totalHits,
            cacheMisses: this.cache.totalMisses,
            hitRate: totalAccesses > 0 ? this.cache.totalHits / totalAccesses : 0
        };
    }
}