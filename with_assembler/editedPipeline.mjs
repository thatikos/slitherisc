/**
 * How the new and updated version should work:
 * Step 1:
 * Have a file of text instructions 
 * Import those instructions into this class
 * Parses the code line by line 
 * 
 * Fetch:
 * It fetches the nth instruction from the text file. 
 * The instruction is stored in the instruction queue
 *    An instruction is popped off and placed in an instruction register 
 * We might need a program counter 
 * 
 * Decode:
 */

/**
 * How the new and updated version should work:
 * Step 1:
 * Have a file of text instructions 
 * Import those instructions into this class
 * Parses the code line by line 
 * 
 * Fetch:
 * It fetches the nth instruction from the text file. 
 * The instruction is stored in the instruction queue
 *    An instruction is popped off and placed in an instruction register 
 * We might need a program counter 
 * 
 * Decode:
 */
// main.js - Main Electron process converted to ES Modules


// main.js - Main Electron process converted to ES Modules

// main.js - Main Electron process converted to ES Modules
import pkg from 'electron';
const { app, BrowserWindow, ipcMain } = pkg;
import path, { dirname } from 'path'; // Import dirname specifically
import fs from 'fs';
import { fileURLToPath } from 'url';
import { OPCODES } from './assembler.mjs';


// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // Use dirname on the string path

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // For debugging
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Create pipeline and register objects
class Pipeline {
  constructor() {
    this.stages = {
      fetch: null, // Will hold instruction string initially
      decode: null, // Will hold instruction string from fetch
      execute: null, // Will hold instruction object from decode
      memory: null, // Will hold instruction object from execute
      writeBack: null // Will hold instruction object from memory
    };
    this.clockCycle = 0;
    // this.isStall = false; // Keep if needed for future hazard handling
  }
}

class Register {
  constructor(value = 0) {
    this.value = value;
  }

  read() {
    return this.value;
  }

  write(newValue) {
    this.value = newValue;
  }
}

class GeneralRegisters {
  constructor() {
    this.GenRegisters = Array(32).fill(0);
  }

  read(regNum) {
    const num = parseInt(regNum);
    if(isNaN(num) || num < 0 || num > 31) {
        console.error('Invalid Register Number:', regNum);
        throw new Error(`Invalid Register Number: ${regNum}`);
    }
    return this.GenRegisters[num];
  }

  write(regNum, newValue) {
     const num = parseInt(regNum);
    if(isNaN(num) || num < 0 || num > 31) {
        console.error('Invalid Register Number:', regNum);
         throw new Error(`Invalid Register Number: ${regNum}`);
    }
    this.GenRegisters[num] = newValue;
  }

  getAllRegisters() {
    return [...this.GenRegisters];
  }
}

// Create global instances
const registers = new GeneralRegisters();
const instructionReg = new Register(); // Holds the last fetched instruction string
const PC = new Register(-1); // Program Counter (Points to the instruction to be fetched next)
const instructionQueue = []; // Queue of instruction strings
const p = new Pipeline(); // Pipeline instance
// Assuming MemorySystem is correctly imported and works from cache-simulator.mjs
// Make sure cache-simulator.mjs is in the same directory or correctly path-resolved
import { MemorySystem } from './cache-simulator.mjs';
const memorySystem = new MemorySystem();


// --- Core Pipeline Simulation Logic ---

// Helper to format instruction object/string for GUI
function formatInstructionForGUI(instr) {
    // Null or undefined → blank
    if (instr == null) return '-';
  
    // A raw 32-bit word from your binary fetch → show hex
    if (typeof instr === 'number') {
      return '0x' + instr.toString(16).padStart(8, '0');
    }
  
    // A string (already formatted) → leave it
    if (typeof instr === 'string') {
      return instr;
    }
  
    // Otherwise it’s your decoded instruction object
    let details = instr.type || 'NOP';
    switch (instr.type) {
      case 'ADD':
      case 'SUB':
        details += ` R${instr.RdNum}, R${instr.RnNum}, R${instr.RmNum}`;
        if (instr.result != null) details += ` [Res:${instr.result}]`;
        break;
      case 'ADDI':
      case 'SUBI':
        details += ` R${instr.RdNum}, R${instr.RnNum}, ${instr.immediateStr}`;
        if (instr.result != null) details += ` [Res:${instr.result}]`;
        break;
      case 'LOAD':
      case 'STR':
        details += ` R${instr.RdNum}, R${instr.RnNum}, ${instr.offsetStr}`;
        if (instr.memoryAddress != null) details += ` [Addr:${instr.memoryAddress}]`;
        if (instr.memoryResult  != null) details += ` [Val:${instr.memoryResult}]`;
        break;
      case 'MOV':
        details += ` R${instr.RdNum}, R${instr.RnNum}`;
        if (instr.result != null) details += ` [Res:${instr.result}]`;
        break;
      case 'MOVI':
        details += ` R${instr.RdNum}, ${instr.immediateStr}`;
        if (instr.result != null) details += ` [Res:${instr.result}]`;
        break;
      case 'NOP':
        details = 'NOP';
        break;
    }
    return details;
  }
  


// Simulates one clock cycle of the pipeline
function simulateClockCycle() {
    // Capture state at the start of the cycle
    const currentStages = {
        fetch:     p.stages.fetch,
        decode:    p.stages.decode,
        execute:   p.stages.execute,
        memory:    p.stages.memory,
        writeBack: p.stages.writeBack
    };

    // Check if pipeline is empty and no more instructions to fetch
    const isPipelineEmptyAtStart =
        currentStages.fetch     === null &&
        currentStages.decode    === null &&
        currentStages.execute   === null &&
        currentStages.memory    === null &&
        currentStages.writeBack === null;

    // Any pending memory operations?
    const pendingMemAtStart = Object.keys(memorySystem.getPendingRequests()).length > 0;

    // If both pipeline and memory are idle and we've done at least one cycle, finish
    if (
        isPipelineEmptyAtStart &&
        instructionQueue.length === 0 &&
        !pendingMemAtStart &&
        p.clockCycle > 0
    ) {
        console.log(`Clock ${p.clockCycle-1}: Simulation complete.`);
        mainWindow.webContents.send('simulation-complete');
        updateGUI();
        return;
    }

    // Advance the clock
    p.clockCycle++;
    console.log(`--- Clock Cycle ${p.clockCycle} ---`);

    // Prepare next‐stage holders
    let nextDecode, nextExecute, nextMemory, nextWriteBack;

    // 1) WRITEBACK
    if (currentStages.writeBack) {
        const instr = currentStages.writeBack;
        switch (instr.type) {
            case 'ADD': case 'ADDI': case 'SUB': case 'SUBI':
            case 'MOV': case 'MOVI':
                registers.write(instr.RdNum, instr.result);
                break;
            case 'LOAD':
                registers.write(instr.RdNum, instr.memoryResult);
                break;
            // STR/NOP retire without register writes
        }
    }

    // 2) MEMORY
    if (currentStages.memory) {
        const instr = currentStages.memory;
        switch (instr.type) {
            case 'LOAD': {
                const res = memorySystem.read(instr.memoryAddress, 'memory');
                if (res.status === 'done') {
                    instr.memoryResult = res.data;
                } else {
                    // force‐complete from cache or main memory
                    const c = memorySystem.cache.read(instr.memoryAddress);
                    if (c.hit) {
                        instr.memoryResult = c.data;
                    } else {
                        const { lineIndex, offset } =
                            memorySystem.memory.getLineAndOffset(instr.memoryAddress);
                        instr.memoryResult = memorySystem.memory.data[lineIndex][offset];
                        // update cache line
                        memorySystem.cache.cache[
                            memorySystem.cache.getIndex(instr.memoryAddress)
                        ].updateCacheLine(
                            memorySystem.cache.getTag(instr.memoryAddress),
                            memorySystem.memory.data[lineIndex]
                        );
                    }
                }
                break;
            }
            case 'STR': {
                const val = registers.read(instr.RdNum);
                const res = memorySystem.write(instr.memoryAddress, val, 'memory');
                if (res.status !== 'done') {
                    // force write-through into cache
                    const idx = memorySystem.cache.getIndex(instr.memoryAddress);
                    const cacheLine = memorySystem.cache.cache[idx];
                    // use the cacheLine's data length instead of external wordsPerLine
                    const off = instr.memoryAddress % cacheLine.data.length;
                    cacheLine.data[off] = val;
                    // also update main memory directly
                    const { lineIndex, offset } =
                        memorySystem.memory.getLineAndOffset(instr.memoryAddress);
                    memorySystem.memory.data[lineIndex][offset] = val;
                }
                break;
            }
            // NOP or other instructions need no memory action
        }
        nextWriteBack = instr;
    }

    // 3) EXECUTE
    if (currentStages.execute) {
        const instr = currentStages.execute;
        switch (instr.type) {
            case 'ADD':
                instr.result = instr.RnValue + instr.RmValue; break;
            case 'ADDI':
                instr.result = instr.RnValue + instr.immediate; break;
            case 'SUB':
                instr.result = instr.RnValue - instr.RmValue; break;
            case 'SUBI':
                instr.result = instr.RnValue - instr.immediate; break;
            case 'MOV':
                instr.result = instr.RnValue; break;
            case 'MOVI':
                instr.result = instr.immediate; break;
            case 'LOAD':
            case 'STR':
                instr.memoryAddress = instr.RnValue + instr.offset;
                break;
        }
        nextMemory = instr;
    }

    // 4) DECODE
    if (currentStages.decode != null) {
        const word = currentStages.decode;
        const op   = (word >>> 24) & 0xff;
        const rd   = (word >>> 16) & 0xff;
        const rn   = (word >>>  8) & 0xff;
        const imm8 =  word         & 0xff;
        let instr = { original: word.toString(16).padStart(8, '0') };

        switch (op) {
            case OPCODES.MOVI:
                instr.type = 'MOVI';
                instr.RdNum = rd;
                instr.immediate    = imm8;
                instr.immediateStr = imm8.toString();
                break;
            case OPCODES.MOV:
                instr.type  = 'MOV';
                instr.RdNum = rd;
                instr.RnNum = rn;
                break;
            case OPCODES.ADD:
                instr.type  = 'ADD';
                instr.RdNum = rd;
                instr.RnNum = rn;
                instr.RmNum = imm8;
                break;
            case OPCODES.SUB:
                instr.type  = 'SUB';
                instr.RdNum = rd;
                instr.RnNum = rn;
                instr.RmNum = imm8;
                break;
            case OPCODES.ADDI:
                instr.type         = 'ADDI';
                instr.RdNum        = rd;
                instr.RnNum        = rn;
                instr.immediate    = imm8;
                instr.immediateStr = imm8.toString();
                break;
            case OPCODES.SUBI:
                instr.type         = 'SUBI';
                instr.RdNum        = rd;
                instr.RnNum        = rn;
                instr.immediate    = imm8;
                instr.immediateStr = imm8.toString();
                break;
            case OPCODES.LOAD:
                instr.type      = 'LOAD';
                instr.RdNum     = rd;
                instr.RnNum     = rn;
                instr.offset    = imm8;
                instr.offsetStr = imm8.toString();
                break;
            case OPCODES.STR:
                instr.type      = 'STR';
                instr.RdNum     = rd;
                instr.RnNum     = rn;
                instr.offset    = imm8;
                instr.offsetStr = imm8.toString();
                break;
            default:
                instr.type = 'NOP';
        }
        if (instr.RnNum != null) instr.RnValue = registers.read(instr.RnNum);
        if (instr.RmNum != null) instr.RmValue = registers.read(instr.RmNum);
        nextExecute = instr;
    }

    // 5) FETCH
    if (p.stages.fetch === null && instructionQueue.length > 0) {
        PC.write(PC.read() + 1);
        const word = instructionQueue.shift();
        instructionReg.write(word);
        nextDecode = word;
    }

    // Advance the pipeline registers
    p.stages.writeBack = nextWriteBack || null;
    p.stages.memory    = nextMemory    || null;
    p.stages.execute   = nextExecute   || null;
    p.stages.decode    = nextDecode    || null;
    p.stages.fetch     = null;

    // Final completion check
    const isPipelineEmptyAfter =
        p.stages.fetch     === null &&
        p.stages.decode    === null &&
        p.stages.execute   === null &&
        p.stages.memory    === null &&
        p.stages.writeBack === null;
    const pendingMemAfter = Object.keys(memorySystem.getPendingRequests()).length > 0;

    if (
        isPipelineEmptyAfter &&
        instructionQueue.length === 0 &&
        !pendingMemAfter
    ) {
        console.log(`Clock ${p.clockCycle}: Simulation complete after advancement.`);
        mainWindow.webContents.send('simulation-complete');
    }

    updateGUI();
}



// Function to send updates to the renderer process
function updateGUI() {
  if (!mainWindow) return;

  // Format pipeline stage content for display
  const formattedPipeline = {
    fetch:    formatInstructionForGUI(p.stages.fetch),
    decode:   formatInstructionForGUI(p.stages.decode),
    execute:  formatInstructionForGUI(p.stages.execute),
    memory:   formatInstructionForGUI(p.stages.memory),
    writeBack:formatInstructionForGUI(p.stages.writeBack)
  };
  

  const stateData = {
    pipeline: {
      ...formattedPipeline, // Use formatted content
      clockCycle: p.clockCycle
    },
    registers: registers.getAllRegisters(),
    instructionRegister: instructionReg.read(),
    programCounter: PC.read(),
    instructionQueue: [...instructionQueue],
    // Simplified memory data for display (first 64 addresses)
    memory: memorySystem.getMemorySnapshot ? memorySystem.getMemorySnapshot() : {} // Use getMemorySnapshot if it exists
  };

  mainWindow.webContents.send('update-state', stateData);
}

// Load and process instructions from file
function loadInstructionsFromFile(filename) {
  try {
    // Using path.join to construct the absolute path
    const filePath = path.join(__dirname, filename);
    console.log(`Attempting to load instructions from: ${filePath}`);
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'));

    console.log(`Loaded ${lines.length} instruction lines.`);
    return lines;
  } catch (err) {
    console.error(`Error reading instruction file ${filename}: ${err.message}`);
    // Send error to renderer if possible
     if (mainWindow) {
         mainWindow.webContents.send('simulation-error', `Error loading instructions: ${err.message}`);
     }
    return [];
  }
}

// IPC handlers for renderer communication
import { assembleFile } from './assembler.mjs';

ipcMain.on('start-simulation', (event) => {
  // 1) Assemble
  try {
    assembleFile('instructions.txt', 'instructions.bin');
  } catch (e) {
    return mainWindow.webContents.send('simulation-error', e.message);
  }

  // 2) Load binary instead of text
  const bin = fs.readFileSync(path.join(__dirname, 'instructions.bin'));
  for (let i = 0; i < bin.length; i += 4) {
    const word = bin.readUInt32BE(i);
    instructionQueue.push(word);
  }

  updateGUI();
  mainWindow.webContents.send('instructions-loaded', instructionQueue.length);
});


ipcMain.on('step-simulation', (event) => {
  simulateClockCycle(); // Simulate one clock cycle
});

// Function to reset all simulation state
function resetSimulationState() {
  instructionQueue.length = 0; // Clear queue
  PC.write(-1); // Reset PC (points to the instruction to fetch next)
  instructionReg.write(0); // Reset Instruction Register
  p.clockCycle = 0; // Reset clock cycle
  // Clear pipeline stages
  p.stages = {
    fetch: null,
    decode: null,
    execute: null,
    memory: null,
    writeBack: null
  };

  // Reset registers
  for (let i = 0; i < 32; i++) {
    registers.write(i, 0);
  }

  // Reset memory system (assuming MemorySystem has a reset method)
  if (memorySystem && typeof memorySystem.reset === 'function') {
      memorySystem.reset();
  } else {
       // Basic memory reset if no formal method exists
       if (memorySystem && memorySystem.memory && memorySystem.memory.data) {
           for (let i = 0; i < memorySystem.memory.data.length; i++) {
               if (Array.isArray(memorySystem.memory.data[i])) {
                 memorySystem.memory.data[i].fill(0);
               }
           }
       }
       if (memorySystem && memorySystem.cache && memorySystem.cache.lines) {
            memorySystem.cache.lines.forEach(line => {
                line.valid = false;
                line.tag = null;
                 if (Array.isArray(line.data)) line.data.fill(0);
            });
       }
        if (memorySystem && memorySystem.pendingRequests) {
            if (typeof memorySystem.pendingRequests.clear === 'function') {
                 memorySystem.pendingRequests.clear();
            } else if (Array.isArray(memorySystem.pendingRequests)) {
                 memorySystem.pendingRequests.length = 0;
            }
        }
  }

  console.log("Simulation state reset.");
  // updateGUI() is called by the 'simulation-reset-complete' handler
}


ipcMain.on('reset-simulation', (event) => {
  resetSimulationState();
   mainWindow.webContents.send('simulation-reset-complete');
});

// Initial state update on window load - calls reset which calls updateGUI
app.on('ready', () => {
    createWindow();
    mainWindow.webContents.on('did-finish-load', () => {
        resetSimulationState(); // Ensure state is reset on app start
    });
});
