class MemorySimulator {
    constructor(cacheLines = 16, lineSize = 4, memorySize = 32768, memDelay = 3) {
        this.cache = Array.from({ length: cacheLines }, () => ({ valid: false, tag: null, data: Array(lineSize).fill(0) }));
        this.memory = Array(memorySize).fill(0);
        this.cacheLines = cacheLines;
        this.lineSize = lineSize;
        this.memorySize = memorySize;
        this.memDelay = memDelay;
        this.cycleCount = 0;
        this.pendingRequest = null;
    }

    getLineIndex(address) {
        return Math.floor((address / this.lineSize) % this.cacheLines);
    }

    getTag(address) {
        return Math.floor(address / (this.cacheLines * this.lineSize));
    }

    write(value, address, stage) {
        if (this.pendingRequest) {
            if (this.pendingRequest.stage === stage) {
                this.cycleCount--;
                if (this.cycleCount === 0) {
                    this.memory[address] = value;
                    this.pendingRequest = null;
                    return "done";
                }
            }
            return "wait";
        }
        
        this.pendingRequest = { type: 'write', stage };
        this.cycleCount = this.memDelay;
        return "wait";
    }

    read(address, stage) {
        const lineIndex = this.getLineIndex(address);
        const tag = this.getTag(address);
        const offset = address % this.lineSize;
        
        if (this.cache[lineIndex].valid && this.cache[lineIndex].tag === tag) {
            return `done ${this.cache[lineIndex].data[offset]}`;
        }
        
        if (this.pendingRequest) {
            if (this.pendingRequest.stage === stage) {
                this.cycleCount--;
                if (this.cycleCount === 0) {
                    const baseAddr = address - offset;
                    this.cache[lineIndex] = {
                        valid: true,
                        tag,
                        data: this.memory.slice(baseAddr, baseAddr + this.lineSize)
                    };
                    this.pendingRequest = null;
                    return `done ${this.memory[address]}`;
                }
            }
            return "wait";
        }

        this.pendingRequest = { type: 'read', stage };
        this.cycleCount = this.memDelay;
        return "wait";
    }

    view(level, line) {
        if (level === 1) {
            const { valid, tag, data } = this.cache[line] || {};
            return `Cache Line ${line}: valid=${valid}, tag=${tag}, data=[${data}]`;
        }
        return `Memory Line ${line}: data=[${this.memory.slice(line * this.lineSize, (line + 1) * this.lineSize)}]`;
    }
}

const memorySim = new MemorySimulator();
const commands = [
    () => console.log(memorySim.view(1, 0)),
    () => console.log(memorySim.write(42, 4, 'EX')), 
    () => console.log(memorySim.write(42, 4, 'EX')), 
    () => console.log(memorySim.read(4, 'EX')),
    () => console.log(memorySim.view(1, 1))
];

let i = 0;
const interval = setInterval(() => {
    if (i < commands.length) {
        commands[i++]();
    } else {
        clearInterval(interval);
    }
}, 1000);
