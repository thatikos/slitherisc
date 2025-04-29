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
    if (!instr) return '-';
    if (typeof instr === 'string') return instr; // Raw fetched instruction string

    // Format instruction object based on type and available info
    let details = `${instr.type}`;
    switch (instr.type) {
        case 'ADD':
        case 'SUB':
             details += ` ${instr.Rd || 'R?'}, ${instr.Rn || 'R?'}, ${instr.Rm || 'R?'}`;
             if (instr.RnValue !== undefined && instr.RmValue !== undefined) details += ` [${instr.RnValue}+/${instr.RmValue}]`; // Show operands
             if (instr.result !== undefined) details += ` [Res: ${instr.result}]`; // Show result
            break;
        case 'ADDI':
        case 'SUBI':
             details += ` ${instr.Rd || 'R?'}, ${instr.Rn || 'R?'}, ${instr.immediateStr || '?'}`;
             if (instr.RnValue !== undefined && instr.immediate !== undefined) details += ` [${instr.RnValue}+/${instr.immediate}]`;
             if (instr.result !== undefined) details += ` [Res: ${instr.result}]`;
            break;
        case 'LOAD':
             details += ` ${instr.Rd || 'R?'}, ${instr.Rn || 'R?'}, ${instr.offsetStr || '?'}`;
             if (instr.RnValue !== undefined && instr.offset !== undefined) details += ` [Addr: ${instr.RnValue}+${instr.offset}=${instr.memoryAddress !== undefined ? instr.memoryAddress : '?'}]`;
             else if (instr.memoryAddress !== undefined) details += ` [Addr: ${instr.memoryAddress}]`;
             if (instr.memoryResult !== undefined) details += ` [Val: ${instr.memoryResult}]`;
            break;
        case 'STR':
            details += ` ${instr.Rd || 'R?'}, ${instr.Rn || 'R?'}, ${instr.offsetStr || '?'}`;
             if (instr.RnValue !== undefined && instr.offset !== undefined) details += ` [Addr: ${instr.RnValue}+${instr.offset}=${instr.memoryAddress !== undefined ? instr.memoryAddress : '?'}]`;
             else if (instr.memoryAddress !== undefined) details += ` [Addr: ${instr.memoryAddress}]`;
             // Value to store could be added if needed, but might clutter display
             // if (instr.valueToStore !== undefined) details += ` [Val: ${instr.valueToStore}]`;
            break;
        case 'MOV':
             details += ` ${instr.Rd || 'R?'}, ${instr.Rn || 'R?'}`;
             if (instr.RnValue !== undefined) details += ` [${instr.RnValue}]`;
              if (instr.result !== undefined) details += ` [Res: ${instr.result}]`;
            break;
        case 'MOVI':
             details += ` ${instr.Rd || 'R?'}, ${instr.immediateStr || '?'}`;
             if (instr.immediate !== undefined) details += ` [${instr.immediate}]`;
              if (instr.result !== undefined) details += ` [Res: ${instr.result}]`;
            break;
         case 'NOP':
             details = 'NOP';
             break;
        default:
            details += ' (Processing...)';
            break;
    }
     // Optionally show the original instruction string if space allows or for clarity
     // if (instr.original && details !== instr.original && details !== 'NOP') details = `${details} (${instr.original})`;
    return details;
}


// Simulates one clock cycle of the pipeline
function simulateClockCycle() {
    // Capture state at the start of the cycle
     const currentStages = {
         fetch: p.stages.fetch,
         decode: p.stages.decode,
         execute: p.stages.execute,
         memory: p.stages.memory,
         writeBack: p.stages.writeBack
     };

    // Check for simulation completion based on state at start of cycle and queue
     const isPipelineEmptyAtStartOfCycle = currentStages.fetch === null && currentStages.decode === null && currentStages.execute === null && currentStages.memory === null && currentStages.writeBack === null;
     if (isPipelineEmptyAtStartOfCycle && instructionQueue.length === 0 && p.clockCycle > 0) {
          console.log(`Clock ${p.clockCycle-1}: Simulation complete.`); // Log completion for the cycle that just finished draining
          mainWindow.webContents.send('simulation-complete');
          updateGUI();
          return; // Stop simulation
     }

     p.clockCycle++; // Increment clock cycle
     console.log(`--- Clock Cycle ${p.clockCycle} ---`);
     // console.log("Stages at start:", currentStages);


     // Temporary variables to hold the instructions *moving into* the next stage
     let nextFetch = null;     // What goes into Fetch for the next cycle (usually null)
     let nextDecode = null;    // What goes into Decode for the next cycle (fetched instruction string)
     let nextExecute = null;   // What goes into Execute for the next cycle (decoded instruction object)
     let nextMemory = null;    // What goes into Memory for the next cycle (executed instruction object)
     let nextWriteBack = null; // What goes into Writeback for the next cycle (memory instruction object)


     // 1. Writeback Stage: Processes instruction from currentStages.writeBack
     if (currentStages.writeBack) {
         const instr = currentStages.writeBack;
         console.log(`Clock ${p.clockCycle}: WB - Processing ${instr.original || 'NOP'}`);
         // Perform writeback action based on instruction type
         switch (instr.type) {
            case 'ADD': case 'ADDI': case 'SUB': case 'SUBI': case 'MOV': case 'MOVI':
                 try { registers.write(instr.RdNum, instr.result); console.log(`Clock ${p.clockCycle}: WB - Writing ${instr.result} to R${instr.RdNum}`); } catch (e) { console.error(`Clock ${p.clockCycle}: WB - Reg write error: ${e.message}`); }
                break;
            case 'LOAD':
                 try { registers.write(instr.RdNum, instr.memoryResult); console.log(`Clock ${p.clockCycle}: WB - Writing ${instr.memoryResult} to R${instr.RdNum}`); } catch (e) { console.error(`Clock ${p.clockCycle}: WB - Reg write error: ${e.message}`); }
                 break;
            case 'STR': console.log(`Clock ${p.clockCycle}: WB - STR completes`); break; // STR finishes here
            case 'NOP': console.log(`Clock ${p.clockCycle}: WB - NOP`); break;
             default: console.warn(`Clock ${p.clockCycle}: WB - Unhandled: ${instr.type}`); break;
         }
         // Instruction retires, does not move to a next stage (nextWriteBack remains null)
     } else {
         console.log(`Clock ${p.clockCycle}: WB - Stage empty`);
         nextWriteBack = null; // Ensure this is explicitly null if no instruction came from MEM
     }

    // 2. Memory Stage: Processes instruction from currentStages.memory
    if (currentStages.memory) {
        const instr = currentStages.memory;
         console.log(`Clock ${p.clockCycle}: MEM - Processing ${instr.original || 'NOP'}`);
        switch (instr.type) {
            case 'LOAD':
                 try {
                     const loadResult = memorySystem.read(instr.memoryAddress, 'memory');
                     if (loadResult.status === "done") {
                          instr.memoryResult = loadResult.data;
                          console.log(`Clock ${p.clockCycle}: MEM - Read ${instr.memoryResult} from ${instr.memoryAddress}`);
                     } else {
                          console.warn(`Clock ${p.clockCycle}: MEM - LOAD ${instr.original} received wait. Simulating completion.`);
                           const cacheCheck = memorySystem.cache.read(instr.memoryAddress);
                           if(cacheCheck.hit) { instr.memoryResult = cacheCheck.data; }
                           else {
                                const { lineIndex, offset } = memorySystem.memory.getLineAndOffset(instr.memoryAddress);
                                instr.memoryResult = memorySystem.memory.data[lineIndex][offset];
                                memorySystem.cache.write(instr.memoryAddress, instr.memoryResult);
                           }
                     }
                 } catch (e) { console.error(`Clock ${p.clockCycle}: MEM - LOAD error: ${e.message}`); instr.type = 'NOP'; instr.memoryResult = 0;}
                break;
            case 'STR':
                 try {
                     const valueToStore = registers.read(instr.RdNum); // Read value to store
                     instr.valueToStore = valueToStore; // Store for display
                     const storeResult = memorySystem.write(instr.memoryAddress, valueToStore, 'memory');
                      if (storeResult.status === "done") {
                           console.log(`Clock ${p.clockCycle}: MEM - Wrote ${valueToStore} to ${instr.memoryAddress}`);
                      } else {
                          console.warn(`Clock ${p.clockCycle}: MEM - STR ${instr.original} received wait. Simulating completion.`);
                           memorySystem.cache.write(instr.memoryAddress, valueToStore);
                           const { lineIndex, offset } = memorySystem.memory.getLineAndOffset(instr.memoryAddress);
                            memorySystem.memory.data[lineIndex][offset] = valueToStore;
                      }
                 } catch (e) { console.error(`Clock ${p.clockCycle}: MEM - STR error: ${e.message}`); instr.type = 'NOP'; }
                 break;
            case 'NOP': console.log(`Clock ${p.clockCycle}: MEM - NOP`); break;
            default: console.log(`Clock ${p.clockCycle}: MEM - No data memory access needed for ${instr.type}`); break;
        }
        nextWriteBack = instr; // This instruction moves to Writeback for the *next* cycle
    } else {
        console.log(`Clock ${p.clockCycle}: MEM - Stage empty`);
         nextWriteBack = null; // Nothing moves to Writeback from here
    }

    // 3. Execute Stage: Processes instruction from currentStages.execute
    if (currentStages.execute) {
        const instr = currentStages.execute;
         console.log(`Clock ${p.clockCycle}: EX - Processing ${instr.original || 'NOP'}`);
        switch (instr.type) {
            case 'ADD': case 'ADDI': case 'SUB': case 'SUBI':
                 if (instr.RnValue !== undefined && (instr.RmValue !== undefined || instr.immediate !== undefined)) {
                     if (instr.type === 'ADD') instr.result = instr.RnValue + instr.RmValue;
                     else if (instr.type === 'ADDI') instr.result = instr.RnValue + instr.immediate;
                     else if (instr.type === 'SUB') instr.result = instr.RnValue - instr.RmValue;
                     else if (instr.type === 'SUBI') instr.result = instr.RnValue - instr.immediate;
                     console.log(`Clock ${p.clockCycle}: EX - Result: ${instr.result}`);
                 } else { console.warn(`EX - ${instr.type} missing ops`); instr.type = 'NOP'; }
                break;
            case 'LOAD': case 'STR': // Calculate effective address
                 if (instr.RnValue !== undefined && instr.offset !== undefined) { instr.memoryAddress = instr.RnValue + instr.offset; console.log(`Clock ${p.clockCycle}: EX - Addr: ${instr.memoryAddress}`); } else { console.warn('EX - L/S missing ops'); instr.type = 'NOP'; }
                break;
            case 'MOV': if (instr.RnValue !== undefined) { instr.result = instr.RnValue; console.log(`Clock ${p.clockCycle}: EX - Result: ${instr.result}`); } else { console.warn('EX - MOV missing ops'); instr.type = 'NOP'; } break;
            case 'MOVI': if (instr.immediate !== undefined) { instr.result = instr.immediate; console.log(`Clock ${p.clockCycle}: EX - Result: ${instr.immediate}`); } else { console.warn('EX - MOVI missing ops'); instr.type = 'NOP'; } break;
            case 'NOP': console.log(`Clock ${p.clockCycle}: EX - NOP`); break;
             default: console.warn(`Clock ${p.clockCycle}: EX - Unhandled: ${instr.type}`); break;
        }
         nextMemory = instr; // This instruction moves to Memory for the *next* cycle
    } else {
        console.log(`Clock ${p.clockCycle}: EX - Stage empty`);
         nextMemory = null; // Nothing moves to Memory from here
    }

    // 4. Decode Stage: Processes instruction string from currentStages.decode
     if (currentStages.decode) {
        const instructionString = currentStages.decode;
        console.log(`Clock ${p.clockCycle}: DEC - Decoding "${instructionString}"`);
        let listOfInst = instructionString.split(" ");
        const type = listOfInst[0].toUpperCase();
        let instr = { type: type, original: instructionString }; // Create instruction object

        let isValid = true;
        try {
            switch(type){
                case 'ADD': case 'SUB':
                    if (listOfInst.length === 4 && listOfInst[1].startsWith('R') && listOfInst[2].startsWith('R') && listOfInst[3].startsWith('R')) {
                        instr.Rd = listOfInst[1]; instr.Rn = listOfInst[2]; instr.Rm = listOfInst[3];
                        instr.RdNum = parseInt(listOfInst[1].slice(1)); instr.RnNum = parseInt(listOfInst[2].slice(1)); instr.RmNum = parseInt(listOfInst[3].slice(1));
                        instr.RnValue = registers.read(instr.RnNum); instr.RmValue = registers.read(instr.RmNum);
                    } else isValid = false; break;
                case 'ADDI': case 'SUBI':
                    if (listOfInst.length === 4 && listOfInst[1].startsWith('R') && listOfInst[2].startsWith('R') && !isNaN(parseInt(listOfInst[3]))) {
                        instr.Rd = listOfInst[1]; instr.Rn = listOfInst[2]; instr.immediateStr = listOfInst[3];
                        instr.RdNum = parseInt(listOfInst[1].slice(1)); instr.RnNum = parseInt(listOfInst[2].slice(1)); instr.immediate = parseInt(listOfInst[3]);
                        instr.RnValue = registers.read(instr.RnNum);
                    } else isValid = false; break;
                case 'LOAD': case 'STR':
                    if (listOfInst.length === 4 && listOfInst[1].startsWith('R') && listOfInst[2].startsWith('R') && !isNaN(parseInt(listOfInst[3]))) {
                        instr.Rd = listOfInst[1]; instr.Rn = listOfInst[2]; instr.offsetStr = listOfInst[3];
                        instr.RdNum = parseInt(listOfInst[1].slice(1)); instr.RnNum = parseInt(listOfInst[2].slice(1)); instr.offset = parseInt(listOfInst[3]);
                        instr.RnValue = registers.read(instr.RnNum); // Base register for address
                    } else isValid = false; break;
                case 'MOV':
                    if (listOfInst.length === 3 && listOfInst[1].startsWith('R') && listOfInst[2].startsWith('R')) {
                        instr.Rd = listOfInst[1]; instr.Rn = listOfInst[2];
                        instr.RdNum = parseInt(listOfInst[1].slice(1)); instr.RnNum = parseInt(listOfInst[2].slice(1));
                        instr.RnValue = registers.read(instr.RnNum);
                    } else isValid = false; break;
                case 'MOVI':
                    if (listOfInst.length === 3 && listOfInst[1].startsWith('R') && !isNaN(parseInt(listOfInst[2]))) {
                        instr.Rd = listOfInst[1]; instr.immediateStr = listOfInst[2];
                        instr.RdNum = parseInt(listOfInst[1].slice(1)); instr.immediate = parseInt(listOfInst[2]);
                    } else isValid = false; break;
                case 'NOP': break;
                default: isValid = false; console.error(`Clock ${p.clockCycle}: DEC - Unknown instruction type: ${type}`); break;
            }
        } catch (e) {
             console.error(`Clock ${p.clockCycle}: DEC - Error during decoding or register read for "${instructionString}": ${e.message}`);
             isValid = false;
        }

        if (!isValid) { instr.type = 'NOP'; instr.original = instructionString; console.warn(`Clock ${p.clockCycle}: DEC - Converted invalid instruction "${instructionString}" to NOP.`); }

        nextExecute = instr; // Instruction object moves to EX stage input for next cycle
    } else {
        console.log(`Clock ${p.clockCycle}: DEC - Stage empty`);
        nextExecute = null;
    }

    // 5. Fetch Stage: Fetches new instruction if queue is not empty AND Fetch stage is empty
     if (currentStages.fetch === null && instructionQueue.length > 0) {
        PC.write(PC.read() + 1); // Increment PC to point to the *next* instruction after fetch
        const fetchedInstructionString = instructionQueue.shift(); // Get instruction string from queue
        instructionReg.write(fetchedInstructionString); // Update Instruction Register display
        console.log(`Clock ${p.clockCycle}: FT - Fetched "${fetchedInstructionString}", PC=${PC.read()}`);
        nextDecode = fetchedInstructionString; // Fetched string moves to DEC stage input for next cycle
     } else if (currentStages.fetch !== null) {
         // If Fetch stage was occupied at the start of the cycle, and nothing was fetched (because queue was empty)
         // or Decode was stalled (not modeled), the instruction would remain in Fetch.
         // In our simple unstalled pipeline, if something was in Fetch, it should have moved to Decode's input
         // (handled by the nextDecode assignment below based on currentStages.fetch).
         console.log(`Clock ${p.clockCycle}: FT - Stage occupied with "${currentStages.fetch}". Not fetching new.`);
         nextDecode = currentStages.fetch; // The instruction stays in (or moves to) Decode input
     }
     else {
         console.log(`Clock ${p.clockCycle}: FT - Queue empty and stage was empty. Nothing to fetch.`);
         nextDecode = null; // Nothing moves to Decode
     }

     // nextFetch is always null in a simple pipeline like this, as the fetched instruction
     // moves directly to the next stage's input. The Fetch stage slot itself is just a temporary
     // holding place for the instruction fetched *in the previous cycle*.


     // --- Advance Pipeline Stages ---
     // Update the pipeline stages based on the instructions moving into them.
     // The instruction leaving a stage becomes the instruction entering the next stage.
     // WB <- MEM, MEM <- EX, EX <- DEC, DEC <- FT, FT <- New Fetch (or null)

     p.stages.writeBack = nextWriteBack; // The result of this cycle's MEM stage
     p.stages.memory = nextMemory;       // The result of this cycle's EX stage
     p.stages.execute = nextExecute;   // The result of this cycle's DEC stage
     p.stages.decode = nextDecode;     // The result of this cycle's FT stage (the fetched string)
     p.stages.fetch = null;          // The Fetch stage is now empty, ready for the *next* cycle's fetch


    // Re-check for simulation completion after advancing stages
     const isPipelineEmptyAfterCycle = p.stages.fetch === null &&
                            p.stages.decode === null &&
                            p.stages.execute === null &&
                            p.stages.memory === null &&
                            p.stages.writeBack === null;

    if (isPipelineEmptyAfterCycle && instructionQueue.length === 0) {
        console.log(`Clock ${p.clockCycle}: Simulation complete after advancement.`);
        mainWindow.webContents.send('simulation-complete');
        // Don't return yet, still need to update GUI
    }


    updateGUI(); // Update GUI after completing the cycle
}


// Function to send updates to the renderer process
function updateGUI() {
  if (!mainWindow) return;

  // Format pipeline stage content for display
  const formattedPipeline = {
      fetch: formatInstructionForGUI(p.stages.fetch),
      decode: formatInstructionForGUI(p.stages.decode),
      execute: formatInstructionForGUI(p.stages.execute),
      memory: formatInstructionForGUI(p.stages.memory),
      writeBack: formatInstructionForGUI(p.stages.writeBack)
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
ipcMain.on('start-simulation', (event) => {
  // Reset first to ensure a clean start
  resetSimulationState();
  const instructions = loadInstructionsFromFile('instructions.txt');
  if (instructions.length > 0) {
      instructionQueue.push(...instructions); // Push raw strings to the queue
      // Trigger the first step (cycle 0) to show the initial state (queue, PC=-1, empty pipeline)
      updateGUI(); // Show queue after loading
      mainWindow.webContents.send('instructions-loaded', instructions.length);
  } else {
       mainWindow.webContents.send('instructions-loaded', 0);
       mainWindow.webContents.send('simulation-error', 'No valid instructions loaded.');
       updateGUI(); // Show empty state
  }
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