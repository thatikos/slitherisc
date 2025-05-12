// main.js - Main Electron process converted to ES Modules
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MemorySystem } from './cache-simulator.mjs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true // Enable DevTools by default
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // For debugging - already enabled above
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

// --- Simulation Constants and Enums ---
const STAGE_FETCH = 0;
const STAGE_DECODE = 1;
const STAGE_EXECUTE = 2;
const STAGE_MEMORY = 3;
const STAGE_WRITEBACK = 4;

const INSTRUCTION_TYPE_ALU = 'ALU';
const INSTRUCTION_TYPE_MEMORY = 'MEMORY';
const INSTRUCTION_TYPE_CONTROL = 'CONTROL'; // For branches/jumps

// --- Instruction Class ---
class PipelineInstruction {
    constructor(rawString, pcValue) {
        this.id = PipelineInstruction.nextId++; // Unique ID for tracking
        this.rawInstruction = rawString || "NOP";
        this.pc = pcValue; // PC value when this instruction was fetched

        this.type = null; // INSTRUCTION_TYPE_ALU, INSTRUCTION_TYPE_MEMORY, INSTRUCTION_TYPE_CONTROL
        this.opCode = null; // e.g., 'ADD', 'LOAD'
        this.rd = null; // Destination register number
        this.rn = null; // Source register number
        this.rm = null; // Second source register number (for R-type)
        this.immediate = null;

        // Values fetched from registers during Decode
        this.rnValue = null;
        this.rmValue = null;
        this.rdValueForStore = null; // Value from Rd for STR

        // Calculated values
        this.aluResult = null;
        this.memoryAddress = null;
        this.dataToStore = null; // For STR
        this.dataLoaded = null;  // For LOAD

        this.writebackValue = null;
        this.hasWriteback = false; // Does this instruction write to a register?

        this.isStalled = false; // General stall flag
        this.isBubble = (rawString === null || rawString === "NOP"); // Is this a bubble/NOP?
        this.isEmpty = (rawString === null); // Represents an empty slot that was never an instruction

        // For UI display
        this.currentStageDisplay = "Waiting";
        this.completed = false; // Mark true when it leaves writeback
    }

    static nextId = 0;

    // Simple display for the pipeline view
    getDisplay() {
        if (this.isBubble) return "NOP";
        if (this.isEmpty) return "Empty";
        return `${this.opCode || this.rawInstruction.split(' ')[0]} (PC:${this.pc}, ID:${this.id})`;
    }
}


// --- Pipeline Class ---
class Pipeline {
  constructor() {
    // Stages will hold PipelineInstruction objects or null
    this.stages = [null, null, null, null, null]; // Fetch, Decode, Execute, Memory, WriteBack
    this.clockCycle = 0;
    this.instructionsCompleted = 0;
    this.isHalted = false; // For explicit halt, or end of program
    this.squashFetchDecode = false; // Flag to insert bubbles after a branch
  }

  clear() {
    this.stages = [null, null, null, null, null];
    this.clockCycle = 0;
    this.instructionsCompleted = 0;
    this.isHalted = false;
    this.squashFetchDecode = false;
    PipelineInstruction.nextId = 0;
  }

  getStageContent(stageIndex) {
      const inst = this.stages[stageIndex];
      if (inst) {
          let details = inst.getDisplay();
          if (inst.isStalled) details += " (Stalled)";
          return details;
      }
      return "Empty";
  }
}

// --- Register Classes (Unchanged from original) ---
class Register {
  constructor(value = 0) { this.value = value; }
  read() { return this.value; }
  write(newValue) { this.value = newValue; }
}

class GeneralRegisters {
  constructor() { this.GenRegisters = Array(32).fill(0); } // Assuming 32 registers like common MIPS/ARM
  read(regNum) {
    regNum = Number(regNum);
    if(regNum < 0 || regNum > 31 || isNaN(regNum)) { throw new Error(`Invalid Register Number read: R${regNum}`); }
    return this.GenRegisters[regNum];
  }
  write(regNum, newValue) {
    regNum = Number(regNum);
    if(regNum < 0 || regNum > 31 || isNaN(regNum)) { throw new Error(`Invalid Register Number write: R${regNum}`); }
    this.GenRegisters[regNum] = Number(newValue);
  }
  getAllRegisters() { return [...this.GenRegisters]; }
  reset() { this.GenRegisters.fill(0); }
}

// --- Global Simulation State ---
const registers = new GeneralRegisters();
const PC = new Register(0); // Program Counter, points to the *next* instruction to be fetched
const instructionQueue = []; // Holds raw instruction strings from the file
const pipeline = new Pipeline();
const memorySystem = new MemorySystem();

let simulationRunning = false; // To control run vs step

// --- Simulation Core Logic ---

function resetSimulationState() {
    simulationRunning = false;
    instructionQueue.length = 0;
    PC.write(0);
    pipeline.clear();
    registers.reset();
    memorySystem.reset();
    console.log("Simulation state reset.");
    updateGUI();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('simulation-reset-complete');
    }
}

function doFetchStage() {
    if (pipeline.isHalted) return;
    if (pipeline.stages[STAGE_FETCH] !== null) return; // Fetch stage is already occupied or was just filled

    if (pipeline.squashFetchDecode) { // Insert bubble due to taken branch
        pipeline.stages[STAGE_FETCH] = new PipelineInstruction(null, -1); // Bubble
        pipeline.stages[STAGE_FETCH].isBubble = true;
        console.log(`Pipeline: Squashing FETCH stage (bubble inserted)`);
        // squashFetchDecode will be reset after Decode also gets a bubble or is naturally empty
        return;
    }

    const currentPC = PC.read();
    if (instructionQueue.length > 0) {
        const rawInstr = instructionQueue.shift(); // Get instruction from program
        const newInstruction = new PipelineInstruction(rawInstr, currentPC);
        pipeline.stages[STAGE_FETCH] = newInstruction;
        console.log(`Cycle ${pipeline.clockCycle}: Fetched "${rawInstr}" for PC=${currentPC}`);
        PC.write(currentPC + 1); // Increment PC for the next fetch
    } else {
        // No more instructions in the queue.
        // If all pipeline stages are empty (or contain only bubbles/completed NOPs), simulation might be ending.
        const allStagesEmptyOrDone = pipeline.stages.every(
            inst => inst === null || inst.isBubble || inst.completed
        );
        if (allStagesEmptyOrDone) {
            pipeline.isHalted = true;
            console.log(`Cycle ${pipeline.clockCycle}: Instruction queue empty and pipeline drained. Halting.`);
            mainWindow.webContents.send('simulation-complete');
        } else {
             // Still instructions in flight, insert bubble if fetch is truly empty
            pipeline.stages[STAGE_FETCH] = new PipelineInstruction(null, -1); // Bubble
            pipeline.stages[STAGE_FETCH].isBubble = true;
            console.log(`Cycle ${pipeline.clockCycle}: Instruction queue empty, fetching bubble.`);
        }
    }
}


function doDecodeStage() {
    const inst = pipeline.stages[STAGE_DECODE];
    if (!inst || inst.isBubble || inst.completed) return; // Nothing to decode or already processed

    inst.isStalled = false; // Reset stall from previous cycle

    if (pipeline.squashFetchDecode) {
        pipeline.stages[STAGE_DECODE] = new PipelineInstruction(null, -1); // Insert Bubble
        pipeline.stages[STAGE_DECODE].isBubble = true;
        console.log(`Pipeline: Squashing DECODE stage (bubble inserted)`);
        pipeline.squashFetchDecode = false; // Squashing done for this branch
        return; // Return here, this bubble will move forward or be overwritten.
    }

    // Basic parsing (should be more robust)
    const parts = inst.rawInstruction.split(/[\s,()\[\]#]+/).filter(p => p); // More delimiters
    inst.opCode = parts[0];

    // Example parsing logic (needs to be comprehensive for all your instructions)
    try {
        switch (inst.opCode) {
            case 'ADD':
            case 'SUB':
                inst.type = INSTRUCTION_TYPE_ALU;
                inst.rd = parseInt(parts[1].slice(1));
                inst.rn = parseInt(parts[2].slice(1));
                inst.rm = parseInt(parts[3].slice(1));
                inst.hasWriteback = true;
                break;
            case 'ADDI':
            case 'SUBI':
                inst.type = INSTRUCTION_TYPE_ALU;
                inst.rd = parseInt(parts[1].slice(1));
                inst.rn = parseInt(parts[2].slice(1));
                inst.immediate = parseInt(parts[3]);
                inst.hasWriteback = true;
                break;
            case 'LOAD':
                inst.type = INSTRUCTION_TYPE_MEMORY;
                inst.rd = parseInt(parts[1].slice(1));
                inst.rn = parseInt(parts[2].slice(1)); // Base register
                inst.immediate = parseInt(parts[3]);  // Offset
                inst.hasWriteback = true;
                break;
            case 'STR':
                inst.type = INSTRUCTION_TYPE_MEMORY;
                inst.rd = parseInt(parts[1].slice(1)); // Source register for store
                inst.rn = parseInt(parts[2].slice(1)); // Base register
                inst.immediate = parseInt(parts[3]);  // Offset
                inst.hasWriteback = false;
                break;
            case 'MOV': // MOV Rd, Rn
                inst.type = INSTRUCTION_TYPE_ALU;
                inst.rd = parseInt(parts[1].slice(1));
                inst.rn = parseInt(parts[2].slice(1));
                inst.hasWriteback = true;
                break;
            case 'MOVI': // MOVI Rd, #imm
                inst.type = INSTRUCTION_TYPE_ALU;
                inst.rd = parseInt(parts[1].slice(1));
                inst.immediate = parseInt(parts[2]);
                inst.hasWriteback = true;
                break;
            // Add B, BEQ, etc. for control flow later
            default:
                console.warn(`Cycle ${pipeline.clockCycle}: Unknown instruction in Decode: ${inst.rawInstruction}`);
                inst.opCode = "NOP"; // Treat as NOP
                inst.isBubble = true; // Effectively becomes a bubble
                break;
        }
    } catch (e) {
        console.error(`Cycle ${pipeline.clockCycle}: Error parsing instruction "${inst.rawInstruction}" in Decode: ${e.message}`);
        mainWindow.webContents.send('simulation-error', `Parse Error: ${inst.rawInstruction} - ${e.message}`);
        inst.opCode = "NOP"; // Treat as NOP on error
        inst.isBubble = true;
        pipeline.isHalted = true; // Halt on parse error
        return;
    }


    // --- Data Hazard Detection & Operand Fetch ---
    // Simplified: Check if EX or MEM stages are writing to a register we need to read.
    // A more robust check would also consider WB stage if forwarding is not perfect.
    let hazardDetected = false;
    const registersToRead = [];
    if (inst.rn !== null) registersToRead.push(inst.rn);
    if (inst.rm !== null) registersToRead.push(inst.rm);
    if (inst.opCode === 'STR' && inst.rd !== null) registersToRead.push(inst.rd); // STR reads from Rd

    for (const regNum of registersToRead) {
        const exInst = pipeline.stages[STAGE_EXECUTE];
        const memInst = pipeline.stages[STAGE_MEMORY];

        if (exInst && exInst.hasWriteback && exInst.rd === regNum && !exInst.isBubble) {
            hazardDetected = true;
            console.log(`Cycle ${pipeline.clockCycle}: Data Hazard! Decode (ID:${inst.id}, reading R${regNum}) stalls for Execute (ID:${exInst.id}, writing R${exInst.rd})`);
            break;
        }
        if (memInst && memInst.hasWriteback && memInst.rd === regNum && !memInst.isBubble) {
            // If EX stage didn't have it, but MEM stage does (e.g. LOAD result not yet available)
            hazardDetected = true;
            console.log(`Cycle ${pipeline.clockCycle}: Data Hazard! Decode (ID:${inst.id}, reading R${regNum}) stalls for Memory (ID:${memInst.id}, writing R${memInst.rd})`);
            break;
        }
    }

    if (hazardDetected) {
        inst.isStalled = true;
        return; // Stall, do not fetch operands or advance
    }

    // If no hazard, fetch operands
    try {
        if (inst.rn !== null) inst.rnValue = registers.read(inst.rn);
        if (inst.rm !== null) inst.rmValue = registers.read(inst.rm);
        if (inst.opCode === 'STR' && inst.rd !== null) inst.rdValueForStore = registers.read(inst.rd);
    } catch (e) {
        console.error(`Cycle ${pipeline.clockCycle}: Error reading register for "${inst.rawInstruction}" in Decode: ${e.message}`);
        mainWindow.webContents.send('simulation-error', `Reg Read Error: ${inst.rawInstruction} - ${e.message}`);
        inst.isBubble = true; // Treat as NOP on error
        pipeline.isHalted = true;
    }
}

function doExecuteStage() {
    const inst = pipeline.stages[STAGE_EXECUTE];
    if (!inst || inst.isBubble || inst.completed) return;
    inst.isStalled = false;

    // Perform ALU operations or calculate memory address
    try {
        switch (inst.opCode) {
            case 'ADD':
                inst.aluResult = inst.rnValue + inst.rmValue;
                inst.writebackValue = inst.aluResult;
                break;
            case 'ADDI':
                inst.aluResult = inst.rnValue + inst.immediate;
                inst.writebackValue = inst.aluResult;
                break;
            case 'SUB':
                inst.aluResult = inst.rnValue - inst.rmValue;
                inst.writebackValue = inst.aluResult;
                break;
            case 'SUBI':
                inst.aluResult = inst.rnValue - inst.immediate;
                inst.writebackValue = inst.aluResult;
                break;
            case 'LOAD':
            case 'STR':
                inst.memoryAddress = inst.rnValue + inst.immediate;
                if (inst.opCode === 'STR') {
                    inst.dataToStore = inst.rdValueForStore;
                }
                break;
            case 'MOV':
                inst.aluResult = inst.rnValue;
                inst.writebackValue = inst.aluResult;
                break;
            case 'MOVI':
                inst.aluResult = inst.immediate;
                inst.writebackValue = inst.aluResult;
                break;
             // Handle B, BEQ, JUMP etc. here
             // Example: B TARGET_LABEL (needs label resolution to PC offset/address)
             /*
             case 'B': // Unconditional Branch
                const targetPCForB = resolveLabelToPC(inst.immediate); // inst.immediate would hold label or offset
                PC.write(targetPCForB);
                pipeline.squashFetchDecode = true; // Signal to squash IF and ID in the next cycle
                inst.type = INSTRUCTION_TYPE_CONTROL;
                console.log(`Cycle ${pipeline.clockCycle}: Branch taken. New PC=${targetPCForB}. Squashing IF/ID.`);
                break;
             */
            default:
                // NOP or unrecognized, already handled by making it a bubble
                break;
        }
    } catch (e) {
        console.error(`Cycle ${pipeline.clockCycle}: Error in Execute for "${inst.rawInstruction}": ${e.message}`);
        mainWindow.webContents.send('simulation-error', `Execute Error: ${inst.rawInstruction} - ${e.message}`);
        inst.isBubble = true;
        pipeline.isHalted = true;
    }
}

function doMemoryStage() {
    const inst = pipeline.stages[STAGE_MEMORY];
    if (!inst || inst.isBubble || inst.completed) return;
    inst.isStalled = false;

    const stageId = `mem_stage_inst_${inst.id}`; // Unique ID for memory system requests per instruction

    if (inst.type === INSTRUCTION_TYPE_MEMORY) {
        // Check if this is the first cycle this instruction is in the MEM stage
        // If so, memorySystem.hasPendingRequest might be false before we initiate
        let opInitiatedThisCycle = false;

        if (!memorySystem.hasPendingRequest(stageId) && !inst.memOpCompleted) {
            if (inst.opCode === 'LOAD') {
                console.log(`Cycle ${pipeline.clockCycle}: MEM Stage - ID:${inst.id} Initiating LOAD from addr ${inst.memoryAddress}`);
                memorySystem.read(inst.memoryAddress, stageId);
                opInitiatedThisCycle = true;
            } else if (inst.opCode === 'STR') {
                console.log(`Cycle ${pipeline.clockCycle}: MEM Stage - ID:${inst.id} Initiating STR to addr ${inst.memoryAddress} value ${inst.dataToStore}`);
                memorySystem.write(inst.memoryAddress, inst.dataToStore, stageId);
                opInitiatedThisCycle = true;
            }
        }

        // Always process memory cycle, even if we just initiated
        // Memory system internally handles its own delays.
        memorySystem.processCycle(); // Crucial: process memory system's internal state

        const memResult = memorySystem.getRequestResult(stageId);

        if (memResult) { // Operation completed (hit or miss resolved)
            console.log(`Cycle ${pipeline.clockCycle}: MEM Stage - ID:${inst.id} result received: ${memResult.status}`);
            if (memResult.status === 'done') {
                if (inst.opCode === 'LOAD') {
                    inst.dataLoaded = memResult.data;
                    inst.writebackValue = inst.dataLoaded;
                }
                // For STR, 'done' is enough.
                inst.memOpCompleted = true; // Mark that memory part is done.
            } else if (memResult.status === 'error') {
                console.error(`Cycle ${pipeline.clockCycle}: Memory Error for ID:${inst.id} Addr ${inst.memoryAddress}: ${memResult.message}`);
                mainWindow.webContents.send('simulation-error', `Mem Error (${inst.opCode} ID:${inst.id}): ${memResult.message}`);
                inst.isBubble = true; // Error turns it into NOP
                pipeline.isHalted = true;
                memorySystem.clearRequestResult(stageId); // Clear the error state
            }
        } else if (memorySystem.hasPendingRequest(stageId)) {
            // Still waiting for memory (cache miss, memory delay)
            inst.isStalled = true;
            console.log(`Cycle ${pipeline.clockCycle}: MEM Stage - ID:${inst.id} waiting for memory for addr ${inst.memoryAddress}`);
        } else if (inst.type === INSTRUCTION_TYPE_MEMORY && !inst.memOpCompleted && !opInitiatedThisCycle) {
            // This case implies it's a memory instruction that hasn't completed
            // and for some reason didn't have a pending request nor got a result.
            // This might happen if memory system was busy with another stage when read/write was attempted initially.
            // Re-initiate if it's the first time seeing this situation for this instruction in MEM.
             console.warn(`Cycle ${pipeline.clockCycle}: MEM Stage - ID:${inst.id} re-evaluating memory request for addr ${inst.memoryAddress}`);
             inst.isStalled = true; // Assume stall and try again next cycle.
        }
    } else {
        // Non-memory instruction, just passes through if no stall from WB
        inst.memOpCompleted = true; // Mark as if memory part is done for ALU ops
    }
}


function doWriteBackStage() {
    const inst = pipeline.stages[STAGE_WRITEBACK];
    if (!inst || inst.isBubble || inst.completed ) return;
    inst.isStalled = false; // Should not stall in WB unless an exceptional global halt occurs

    if (inst.hasWriteback && inst.writebackValue !== undefined && inst.writebackValue !== null) {
        try {
            registers.write(inst.rd, inst.writebackValue);
            console.log(`Cycle ${pipeline.clockCycle}: WB Stage - ID:${inst.id} Writing R${inst.rd} = ${inst.writebackValue}`);
        } catch (e) {
            console.error(`Cycle ${pipeline.clockCycle}: Error in WriteBack for ID:${inst.id} R${inst.rd}: ${e.message}`);
            mainWindow.webContents.send('simulation-error', `WB Error (ID:${inst.id}): ${e.message}`);
            pipeline.isHalted = true; // Halt on WB error
        }
    } else {
        console.log(`Cycle ${pipeline.clockCycle}: WB Stage - ID:${inst.id} completes (no reg write).`);
    }
    inst.completed = true;
    pipeline.instructionsCompleted++;
}


// In editedPipeline.mjs, inside the Pipeline class or a relevant scope

function advancePipelineStages() {
  // --- Advance instructions from back to front if next stage is empty or instruction there is completed ---
  // WB -> (out)
  if (pipeline.stages[STAGE_WRITEBACK] && pipeline.stages[STAGE_WRITEBACK].completed) {
      pipeline.stages[STAGE_WRITEBACK] = null;
  }

  // MEM -> WB
  const memInst = pipeline.stages[STAGE_MEMORY];
  if (memInst && !memInst.isStalled && (memInst.isBubble || memInst.memOpCompleted || memInst.type !== INSTRUCTION_TYPE_MEMORY)) {
      if (pipeline.stages[STAGE_WRITEBACK] === null) {
          pipeline.stages[STAGE_WRITEBACK] = memInst;
          pipeline.stages[STAGE_MEMORY] = null;
      } else {
          if(memInst && !memInst.isBubble) {
              // memInst.isStalled = true; // Stalled due to WB busy - UI will reflect it's not moving.
              // The 'isStalled' flag should ideally be set by the stage logic (doMemoryStage) if it can't proceed.
              // For now, we just prevent movement.
          }
      }
  }

  // EX -> MEM
  const exInst = pipeline.stages[STAGE_EXECUTE];
  if (exInst && !exInst.isStalled && !exInst.completed) {
      if (pipeline.stages[STAGE_MEMORY] === null) {
          pipeline.stages[STAGE_MEMORY] = exInst;
          pipeline.stages[STAGE_EXECUTE] = null;
      } else {
          // if(exInst && !exInst.isBubble) exInst.isStalled = true; // Stalled due to MEM busy
      }
  }

  // DEC -> EX
  const decInst = pipeline.stages[STAGE_DECODE];
  if (decInst && !decInst.isStalled && !decInst.completed) {
      if (pipeline.stages[STAGE_EXECUTE] === null) {
          pipeline.stages[STAGE_EXECUTE] = decInst;
          pipeline.stages[STAGE_DECODE] = null;
      } else {
          // if(decInst && !decInst.isBubble) decInst.isStalled = true; // Stalled due to EX busy
      }
  }

  // FETCH -> DEC
  const fetchInst = pipeline.stages[STAGE_FETCH];
  if (fetchInst && !fetchInst.completed) {
      if (pipeline.stages[STAGE_DECODE] === null) {
          // Decode stage is clear, Fetch can move.
          // Crucially, reset its stall status as its prior reason for stall (Decode busy) is gone.
          fetchInst.isStalled = false;
          pipeline.stages[STAGE_DECODE] = fetchInst;
          pipeline.stages[STAGE_FETCH] = null;
          // console.log(`Debug: Moved ID:${fetchInst.id} from FETCH to DECODE. fetchInst.isStalled=${fetchInst.isStalled}`);
      } else {
          // Decode is not null, so Fetch is structurally blocked FOR THIS CYCLE.
          // Mark it as stalled for UI display if it's a real instruction.
          if (!fetchInst.isBubble) {
               fetchInst.isStalled = true;
              // console.log(`Debug: ID:${fetchInst.id} in FETCH is STALLED because DECODE is not null. fetchInst.isStalled=${fetchInst.isStalled}`);
          }
      }
  }
}


function processOneClockCycle() {
    if (pipeline.isHalted && !pipeline.stages.some(s => s && !s.completed && !s.isBubble)) {
        console.log("Pipeline halted and empty or only bubbles remaining.");
        if (simulationRunning) { // If it was continuously running, stop it.
            simulationRunning = false;
            mainWindow.webContents.send('simulation-complete', "Program halted or finished.");
        }
        return;
    }
    if (pipeline.isHalted && instructionQueue.length === 0 && pipeline.stages.every(s => s === null || s.isBubble || s.completed)) {
        mainWindow.webContents.send('simulation-complete', "Program halted or finished.");
        simulationRunning = false;
        return;
    }


    pipeline.clockCycle++;
    console.log(`--- Cycle ${pipeline.clockCycle} Start ---`);

    // Execute stages in reverse order of data flow for easier non-blocking updates this cycle
    // (WB processes what MEM gave it *last* cycle, MEM processes what EX gave it *last* cycle, etc.)
    doWriteBackStage();
    doMemoryStage();
    doExecuteStage();
    doDecodeStage();
    // Actual fetching of a *new* instruction from PC happens after attempting to move current fetched item
    // This reflects that the FETCH *stage register* is loaded at the end of the cycle for the *next* cycle.

    // Advance instructions through the pipeline hardware
    advancePipelineStages();

    // Now, attempt to fill the FETCH stage for the *next* cycle if it's empty
    // This must happen *after* advancing, so we know if STAGE_FETCH became empty
    if (!pipeline.isHalted) { // Only fetch if not globally halted
        doFetchStage();
    }


    console.log(`--- Cycle ${pipeline.clockCycle} End ---`);
    console.log(` F: ${pipeline.getStageContent(STAGE_FETCH)}`);
    console.log(` D: ${pipeline.getStageContent(STAGE_DECODE)}`);
    console.log(` E: ${pipeline.getStageContent(STAGE_EXECUTE)}`);
    console.log(` M: ${pipeline.getStageContent(STAGE_MEMORY)}`);
    console.log(` W: ${pipeline.getStageContent(STAGE_WRITEBACK)}`);


    updateGUI();

    // Check for program completion (queue empty AND pipeline drained)
    if (instructionQueue.length === 0 && pipeline.stages.every(s => s === null || s.isBubble || s.completed)) {
        if (!pipeline.isHalted) { // If not already halted by an error or explicit halt instruction
            console.log("Program finished: Instruction queue and pipeline are empty.");
            mainWindow.webContents.send('simulation-complete', "Program finished normally.");
        }
        pipeline.isHalted = true; // Ensure it's marked as halted
        simulationRunning = false;
    }
}

// --- GUI Update Function ---
function updateGUI() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const pipelineStateForUI = {
      fetch: pipeline.stages[STAGE_FETCH] ? pipeline.stages[STAGE_FETCH].getDisplay() + (pipeline.stages[STAGE_FETCH].isStalled ? " (Stalled)" : "") : "Empty",
      decode: pipeline.stages[STAGE_DECODE] ? pipeline.stages[STAGE_DECODE].getDisplay() + (pipeline.stages[STAGE_DECODE].isStalled ? " (Stalled)" : "") : "Empty",
      execute: pipeline.stages[STAGE_EXECUTE] ? pipeline.stages[STAGE_EXECUTE].getDisplay() + (pipeline.stages[STAGE_EXECUTE].isStalled ? " (Stalled)" : ""): "Empty",
      memory: pipeline.stages[STAGE_MEMORY] ? pipeline.stages[STAGE_MEMORY].getDisplay() + (pipeline.stages[STAGE_MEMORY].isStalled ? " (Stalled)" : "") : "Empty",
      writeBack: pipeline.stages[STAGE_WRITEBACK] ? pipeline.stages[STAGE_WRITEBACK].getDisplay() : "Empty",
      clockCycle: pipeline.clockCycle,
      instructionsCompleted: pipeline.instructionsCompleted,
      pc: PC.read(),
  };

  const stateData = {
    pipeline: pipelineStateForUI,
    registers: registers.getAllRegisters(),
    // instructionRegister: pipeline.stages[STAGE_FETCH] ? pipeline.stages[STAGE_FETCH].rawInstruction : "N/A", // Or current IF/ID latch
    programCounter: PC.read(), // PC now points to the *next* instruction to be fetched.
    instructionQueue: [...instructionQueue], // Show remaining instructions
    memory: memorySystem.getMemorySnapshot(0, 64),
    cacheStats: memorySystem.getStats(), // Add cache stats to GUI
  };

  try {
      mainWindow.webContents.send('update-state', stateData);
  } catch (error) {
       console.error("Error sending update to renderer:", error);
  }
}

// --- File Loading ---
function loadInstructionsFromFile(filename) {
  try {
    const filePath = path.join(__dirname, filename); // Assuming filename is relative to __dirname
    if (!fs.existsSync(filePath)) {
        throw new Error(`Instruction file not found: ${filename} (looked in ${filePath})`);
    }
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n')
      .map(line => line.replace(/#.*$/, '').trim()) // Remove comments
      .filter(line => line && !line.startsWith('//') && !line.startsWith('/*')); // Remove empty/comment lines
    console.log(`Loaded ${lines.length} instructions from ${filename}`);
    return lines;
  } catch (err) {
    console.error(`Error reading instruction file: ${err}`);
     if (mainWindow && !mainWindow.isDestroyed()){
         mainWindow.webContents.send('simulation-error', `Failed to load ${filename}: ${err.message}`);
     }
    return [];
  }
}

// --- IPC Handlers ---
ipcMain.on('start-simulation', (event, fileName = 'instructions.txt') => {
  console.log("Received 'start-simulation' request.");
  resetSimulationState();
  const instructions = loadInstructionsFromFile(fileName);
  if (instructions.length > 0) {
      instructionQueue.push(...instructions.map(i => i.toUpperCase()));
      console.log(`Pushed ${instructions.length} instructions to queue.`);
      // Initial fetch attempt for the very first instruction
      // doFetchStage(); // This will load PC=0 into fetch stage
  } else {
      mainWindow.webContents.send('simulation-error', `No instructions loaded from ${fileName}.`);
  }
  updateGUI(); // Show initial state
  mainWindow.webContents.send('instructions-loaded', instructionQueue.length);
});

ipcMain.on('step-simulation', (event) => {
  if (!pipeline.isHalted || pipeline.stages.some(s => s && !s.completed && !s.isBubble)) {
      processOneClockCycle();
  } else {
      console.log("Step requested, but simulation is halted and pipeline is drained.");
      mainWindow.webContents.send('simulation-complete', "Simulation ended or halted.");
  }
});

ipcMain.on('run-simulation', (event) => {
    if (pipeline.isHalted && !pipeline.stages.some(s => s && !s.completed && !s.isBubble)) {
        console.log("Run requested, but simulation already halted/finished.");
        mainWindow.webContents.send('simulation-complete', "Simulation ended or halted.");
        return;
    }
    simulationRunning = true;
    console.log("Run simulation started.");
    function run() {
        if (simulationRunning && (!pipeline.isHalted || pipeline.stages.some(s => s && !s.completed && !s.isBubble))) {
            processOneClockCycle();
            setTimeout(run, 100); // Adjust delay for simulation speed, 0 for max speed
        } else {
            simulationRunning = false;
            if (pipeline.isHalted) {
                 console.log("Run simulation halted/finished.");
                 mainWindow.webContents.send('simulation-complete', "Simulation ended or halted.");
            }
        }
    }
    run();
});


ipcMain.on('stop-simulation', (event) => {
    simulationRunning = false;
    console.log("Stop simulation requested.");
});


ipcMain.on('reset-simulation', (event) => {
  console.log("Received 'reset-simulation' request.");
  resetSimulationState();
});

// Request to view a cache line
ipcMain.on('view-cache-line', (event, lineIndex) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const lineData = memorySystem.viewCache(lineIndex);
        mainWindow.webContents.send('cache-line-data', { index: lineIndex, data: lineData });
    }
});

// Request to view a memory line (assuming memory lines are groups of wordsPerLine)
ipcMain.on('view-memory-line', (event, lineIndex) => {
     if (mainWindow && !mainWindow.isDestroyed()) {
        const lineData = memorySystem.viewMemory(lineIndex); // Make sure viewMemory in cache-simulator.mjs returns the line
        mainWindow.webContents.send('memory-line-data', { index: lineIndex, data: lineData });
    }
});