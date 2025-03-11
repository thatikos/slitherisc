/*
Things to Consider: 
Block Placement: 
    Direct Mapping
Block Identification 
Block Replacement 
    LRU (Note: With direct mapping, we don't have choice in replacement)
Write Strategy: 
    Write through 
*/ 

const wordSizeBytes = 4; // 32 bits 
const wordsPerLine = 16;   
const lineSizeBytes = wordSizeBytes * wordsPerLine; 
const cacheLineCount = 16; // Number of cache lines
const memorySize = 32768; // Memory size in words

// Address breakdown calculations
const offsetBits = Math.log2(lineSizeBytes); // Bits needed for byte offset
const indexBits = Math.log2(cacheLineCount); // Bits needed for cache index
const tagBits = 32 - indexBits - offsetBits; // Assuming 32-bit addresses

class CacheLine {
    constructor() {
        this.tag = null; 
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
        this.lines = new Array(cacheLineCount).fill().map(() => new CacheLine());
        this.totalMisses = 0;
        this.totalHits = 0;
    }

    // Extract tag, index, and offset from address
    parseAddress(address) {
        // For a 32-bit address with direct mapping
        const offset = address & ((1 << offsetBits) - 1);
        const index = (address >> offsetBits) & ((1 << indexBits) - 1);
        const tag = address >> (offsetBits + indexBits);
        
        return { tag, index, offset };
    }

    // Read data from cache
    read(address) {
        const { tag, index, offset } = this.parseAddress(address);
        const cacheLine = this.lines[index];
        
        if (cacheLine.isCacheHit(tag)) {
            this.totalHits++;
            // Calculate word offset from byte offset
            const wordOffset = Math.floor(offset / wordSizeBytes);
            return cacheLine.data[wordOffset];
        } else {
            this.totalMisses++;
            // Handle cache miss by fetching from memory
            return null; // You'll need to implement memory access
        }
    }

    // Write data to cache (write-through)
    write(address, value, memory) {
        const { tag, index, offset } = this.parseAddress(address);
        const cacheLine = this.lines[index];
        
        // Calculate memory line address
        const memoryLineIndex = Math.floor(address / lineSizeBytes);
        
        // Update memory (write-through)
        const wordOffset = Math.floor(offset / wordSizeBytes);
        memory.data[memoryLineIndex][wordOffset] = value;
        
        // Update cache if it's a hit
        if (cacheLine.isCacheHit(tag)) {
            this.totalHits++;
            cacheLine.data[wordOffset] = value;
        } else {
            this.totalMisses++;
            // In write-through, we might or might not update the cache on a miss
            // For this implementation, let's fetch the line and update cache
            cacheLine.updateCacheLine(tag, memory.data[memoryLineIndex]);
        }
    }
}

class Memory { 
    constructor() {
        this.lineCount = Math.ceil(memorySize / wordsPerLine);
        this.data = new Array(this.lineCount).fill().map(() => new Array(wordsPerLine).fill(0));
        this.accessDelay = 4; // Simulated delay cycles
    }

    // Read a line from memory
    readLine(lineIndex) {
        // Simulate memory access delay
        for (let i = 0; i < this.accessDelay; i++) {
            // In a real simulation, you might increment a cycle counter here
        }
        return this.data[lineIndex];
    }
    
    // Write to memory
    write(address, value) {
        const lineIndex = Math.floor(address / lineSizeBytes);
        const wordOffset = Math.floor((address % lineSizeBytes) / wordSizeBytes);
        this.data[lineIndex][wordOffset] = value;
    }
}

// Example usage
function runCacheSimulation() {
    const cache = new Cache();
    const memory = new Memory();
    
    // Initialize memory with some data
    for (let i = 0; i < memory.lineCount; i++) {
        for (let j = 0; j < wordsPerLine; j++) {
            memory.data[i][j] = i * 100 + j;
        }
    }
    
    // Example memory accesses
    const addresses = [0, 4, 64, 128, 4, 8, 64, 256];
    
    for (const address of addresses) {
        console.log(`Accessing address: ${address}`);
        const result = cache.read(address);
        
        if (result === null) {
            // Cache miss, fetch from memory
            const { index, tag } = cache.parseAddress(address);
            const lineIndex = Math.floor(address / lineSizeBytes);
            const lineData = memory.readLine(lineIndex);
            
            // Update cache
            cache.lines[index].updateCacheLine(tag, lineData);
            
            // Read again (now it should be a hit)
            const data = cache.read(address);
            console.log(`Data after cache update: ${data}`);
        } else {
            console.log(`Data: ${result}`);
        }
    }
    
    console.log(`Cache hits: ${cache.totalHits}, misses: ${cache.totalMisses}`);
}
