// main.js - Main Electron process converted to ES Modules
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MemorySystem } from './cache-simulator.mjs';
import { assembleInstruction } from './assembler.mjs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// --- Simulation Constants and Enums ---
const STAGE_FETCH = 0;
const STAGE_DECODE = 1;
const STAGE_EXECUTE = 2;
const STAGE_MEMORY = 3;
const STAGE_WRITEBACK = 4;

const INSTRUCTION_TYPE_ALU_STR = 'ALU';
const INSTRUCTION_TYPE_MEMORY_STR = 'MEMORY';
const INSTRUCTION_TYPE_CONTROL_STR = 'CONTROL';

const BIN_TYPE_ARITHMETIC = 0b00;
const BIN_TYPE_MEMORY     = 0b01;
const BIN_TYPE_CONTROL    = 0b10;

// --- Bit Masks and Shifts for Decoding 32-bit instructions ---
const MASK_TYPE = 0b11 << 30; // Bits 31-30
const SHIFT_TYPE = 30;

const MASK_ARITH_OPCODE = 0b11111 << 25; // Bits 29-25
const SHIFT_ARITH_OPCODE = 25;

const MASK_ARITH_RD_R_TYPE = 0b11111 << 10; // Bits 14-10 for R-type Rd
const SHIFT_ARITH_RD_R_TYPE = 10;
const MASK_ARITH_RN_R_TYPE = 0b11111 << 20; // Bits 24-20 for R-type Rn
const SHIFT_ARITH_RN_R_TYPE = 20;
const MASK_ARITH_RM_R_TYPE = 0b11111 << 15; // Bits 19-15 for R-type Rm
const SHIFT_ARITH_RM_R_TYPE = 15;

const MASK_ARITH_RD_I_TYPE = 0b11111 << 15; // Bits 19-15 for I-type Rd
const SHIFT_ARITH_RD_I_TYPE = 15;
const MASK_ARITH_RN_I_TYPE = 0b11111 << 20; // Bits 24-20 for I-type Rn
const SHIFT_ARITH_RN_I_TYPE = 20;
const MASK_ARITH_IMM15 = 0x7FFF;          // Bits 14-0 for Arith Immediate (positive mask)
const SIGN_BIT_ARITH_IMM15 = 1 << 14;     // Sign bit for 15-bit immediate

const MASK_MOVI_RD = 0b11111 << 20; // Bits 24-20
const SHIFT_MOVI_RD = 20;
const MASK_MOVI_IMM20 = 0xFFFFF;      // Bits 19-0
const SIGN_BIT_MOVI_IMM20 = 1 << 19;  // Sign bit for 20-bit immediate

const MASK_SHIFT_ACC_RD = 0b11111 << 20; // Bits 24-20
const SHIFT_SHIFT_ACC_RD = 20;
const MASK_SHIFT_IMM5 = 0b11111 << 15;   // Bits 19-15
const SHIFT_SHIFT_IMM5 = 15;

const MASK_MEM_OPCODE = 0b11 << 28;  // Bits 29-28
const SHIFT_MEM_OPCODE = 28;
const MASK_MEM_RN = 0b11111 << 23;   // Bits 27-23
const SHIFT_MEM_RN = 23;
const MASK_MEM_RD = 0b11111 << 18;   // Bits 22-18 (Dest for LOAD, Src for STR)
const SHIFT_MEM_RD = 18;
const MASK_MEM_OFFSET18 = 0x3FFFF;   // Bits 17-0
const SIGN_BIT_MEM_OFFSET18 = 1 << 17;// Sign bit for 18-bit offset

const MASK_CTRL_OPCODE = 0b111 << 27; // Bits 29-27
const SHIFT_CTRL_OPCODE = 27;
const MASK_CTRL_RN_JMP = 0b11111 << 22;
const SHIFT_CTRL_RN_JMP = 22;
const MASK_CTRL_OFFSET27_BEQ = 0x7FFFFFF;
const SIGN_BIT_CTRL_OFFSET27_BEQ = 1 << 26;
const MASK_CTRL_RN_BLT_CAL_FLUSH = 0b11111 << 22;
const SHIFT_CTRL_RN_BLT_CAL_FLUSH = 22;
const MASK_CTRL_OFFSET22_BLT_CAL = 0x3FFFFF;
const SIGN_BIT_CTRL_OFFSET22_BLT_CAL = 1 << 21;


// --- CLASS DEFINITIONS ---
class PipelineInstruction {
    constructor(binaryInstruction, pcValue, rawAsmString = null) {
        this.id = PipelineInstruction.nextId++;
        this.pc = pcValue;
        this.binaryInstruction = binaryInstruction;
        this.rawInstruction = rawAsmString || `BIN:0x${(binaryInstruction === null || binaryInstruction === undefined ? 0 : binaryInstruction).toString(16).padStart(8, '0')}`;
        this.type = null; this.opCode = null; this.opCodeVal = null;
        this.rd = null; this.rn = null; this.rm = null; this.immediate = null;
        this.rnValue = null; this.rmValue = null; this.rdValueForStore = null;
        this.aluResult = null; this.memoryAddress = null; this.dataToStore = null; this.dataLoaded = null;
        this.writebackValue = null; this.hasWriteback = false;
        this.isStalled = false;
        this.isBubble = (binaryInstruction === null || binaryInstruction === undefined);
        this.isEmpty = false;
        this.currentStageDisplay = "Waiting"; this.completed = false;
        this.branchTaken = false; this.branchTargetPC = null;
        this.fetchInProgress = false; this.fetchError = null;
    }
    static nextId = 0;
    getDisplay() {
        if (this.isBubble) return "NOP/Bubble";
        return `${this.opCode || this.rawInstruction} (PC:${this.pc}, ID:${this.id})`;
    }
}

class Pipeline {
  constructor() {
    this.stages = [null, null, null, null, null];
    this.clockCycle = 0; this.instructionsCompleted = 0;
    this.isHalted = false; this.squashFetchDecode = false;
    this.actualProgramLength = 0;
  }
  clear() {
    this.stages = [null, null, null, null, null]; this.clockCycle = 0;
    this.instructionsCompleted = 0; this.isHalted = false; this.squashFetchDecode = false;
    this.actualProgramLength = 0;
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

class FlagsRegister {
    constructor() { this.ZF = false; this.NF = false; }
    setZN(value) { this.ZF = (value === 0); this.NF = (value < 0); }
    reset() { this.ZF = false; this.NF = false; }
    getFlags() { return { ZF: this.ZF, NF: this.NF }; }
}

class Register {
  constructor(value = 0) { this.value = value; }
  read() { return this.value; }
  write(newValue) { this.value = newValue; }
}

class GeneralRegisters {
  constructor() {
    this.GenRegisters = Array(32).fill(0);
    this.flags = new FlagsRegister();
  }
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
  updateFlags(result) { this.flags.setZN(result); }
  getFlags() { return this.flags.getFlags(); }
  reset() { this.GenRegisters.fill(0); this.flags.reset(); }
  getAllRegisters() { return [...this.GenRegisters]; }
}
// --- END OF CLASS DEFINITIONS ---


// --- GLOBAL SIMULATION STATE ---
const registers = new GeneralRegisters();
const PC = new Register(0);
const pipeline = new Pipeline();
const memorySystem = new MemorySystem();
let simulationRunning = false;
const MAX_PROGRAM_SIZE = 8192; // Represents physical memory size limit

// --- Helper for sign extension ---
function signExtend(value, originalBitLength) {
    const signBit = 1 << (originalBitLength - 1);
    if (value & signBit) {
        const mask = 0xFFFFFFFF << originalBitLength;
        return value | mask;
    }
    return value;
}

// --- SIMULATION STATE RESET FUNCTION --- <<<< DEFINITION IS HERE
function resetSimulationState() {
    simulationRunning = false;
    PC.write(0);
    pipeline.clear(); // This will also reset actualProgramLength
    registers.reset();
    memorySystem.reset();
    console.log("Simulation state reset.");
    updateGUI();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('simulation-reset-complete');
    }
}

// --- Simulation Core Logic ---
function doFetchStage() {
    if (pipeline.isHalted) return;
    let fetchSlotInst = pipeline.stages[STAGE_FETCH];

    // --- LOGGING: Start of function ---
    if (fetchSlotInst && !fetchSlotInst.isBubble) {
        console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Current Inst: ID ${fetchSlotInst.id}, PC ${fetchSlotInst.pc}, InProgress: ${fetchSlotInst.fetchInProgress}, Stalled: ${fetchSlotInst.isStalled}, Bin: ${fetchSlotInst.binaryInstruction}`);
    } else if (fetchSlotInst && fetchSlotInst.isBubble) {
         console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Bubble`);
    } else {
         console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Empty`);
    }
    // --- END LOGGING ---

    // Logic to initiate a new fetch if the stage is empty or holds a completed bubble
    if (fetchSlotInst === null || (fetchSlotInst.isBubble && fetchSlotInst.completed)) {
        // Check if pipeline is being squashed due to a branch
        if (pipeline.squashFetchDecode) {
            const bubble = new PipelineInstruction(null, -1); // Use -1 PC for clarity
            bubble.isBubble = true; bubble.completed = true;
            pipeline.stages[STAGE_FETCH] = bubble;
            console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Squashing, inserting bubble.`); // Logging
            // Do NOT increment PC when squashing
            return; // Exit after inserting bubble
        }

        const currentPC = PC.read();

        // Check for program end based on loaded instruction count
        if (currentPC >= pipeline.actualProgramLength && pipeline.actualProgramLength > 0) {
            console.log(`Cycle ${pipeline.clockCycle}: PC ${currentPC} reached end of loaded program (${pipeline.actualProgramLength}). Halting fetch.`); // Logging
            pipeline.isHalted = true;
            // Insert a completed bubble to signify the end at the fetch stage
            const bubble = new PipelineInstruction(null, currentPC);
            bubble.isBubble = true; bubble.completed = true;
            pipeline.stages[STAGE_FETCH] = bubble;
            return; // Exit after halting
        }
        // Fallback check against maximum theoretical memory size
        if (currentPC >= MAX_PROGRAM_SIZE) {
             console.log(`Cycle ${pipeline.clockCycle}: PC ${currentPC} reached MAX_PROGRAM_SIZE (${MAX_PROGRAM_SIZE}). Halting fetch.`); // Logging
             pipeline.isHalted = true;
             const bubble = new PipelineInstruction(null, currentPC);
             bubble.isBubble = true; bubble.completed = true;
             pipeline.stages[STAGE_FETCH] = bubble;
             return; // Exit after halting
        }

        // Create a new instruction object to represent the fetch operation
        const newInstruction = new PipelineInstruction(undefined, currentPC);
        newInstruction.fetchInProgress = true; // Mark that fetch has started
        pipeline.stages[STAGE_FETCH] = newInstruction; // Place it in the Fetch stage

        // --- LOGGING: Attempting memory read ---
        console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Attempting read for PC ${currentPC} (ID: ${newInstruction.id})`);
        // --- END LOGGING ---

        // Initiate the memory read via the memory system
        const memReadStatus = memorySystem.read(currentPC, `Workspace_inst_${newInstruction.id}`);

        // --- LOGGING: Initial memory read status ---
        console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Initial memorySystem.read status for PC ${currentPC}:`, memReadStatus);
        // --- END LOGGING ---

        // Handle immediate error from memory system
        if (memReadStatus.status === 'error') {
            console.error(`Cycle ${pipeline.clockCycle}: Fetch Stage - Memory system error on initial read for PC ${currentPC}: ${memReadStatus.message}`);
            newInstruction.fetchInProgress = false;
            newInstruction.fetchError = memReadStatus.message;
            newInstruction.isBubble = true; // Treat as error/bubble
            pipeline.isHalted = true; // Halt on memory error
            // Do NOT increment PC if read failed immediately
        } else {
            // ******** CORE FIX: Increment PC for the NEXT cycle *******
            // This is the tentative increment for sequential execution.
            // It will be overwritten by Execute stage if a branch is taken in the same cycle.
            PC.write(currentPC + 1);
             // --- LOGGING: PC increment ---
             console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Tentatively incremented PC to ${currentPC + 1}`);
             // --- END LOGGING ---
            // ***********************************************************
        }
        // Return after initiating fetch (or handling immediate error) for this cycle
        return;

    // Logic if the fetch stage holds an instruction that is currently being fetched
    } else if (fetchSlotInst && fetchSlotInst.fetchInProgress) {
        // Allow memory system to process its internal state (e.g., cache delays)
        memorySystem.processCycle();
        // Check if the result for this instruction's fetch request is ready
        const fetchResult = memorySystem.getRequestResult(`Workspace_inst_${fetchSlotInst.id}`);

        // --- LOGGING: Checking fetch result ---
         console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Checking result for ID ${fetchSlotInst.id} (PC ${fetchSlotInst.pc}). Result:`, fetchResult);
        // --- END LOGGING ---

        if (fetchResult) { // If a result status is available
            if (fetchResult.status === 'done') {
                 // --- LOGGING: Fetch success ---
                console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - SUCCESS for ID ${fetchSlotInst.id} (PC ${fetchSlotInst.pc}). Data: ${fetchResult.data}`);
                 // --- END LOGGING ---
                // Fetch completed successfully
                fetchSlotInst.binaryInstruction = fetchResult.data; // Store the fetched data
                fetchSlotInst.rawInstruction = `BIN:0x${(fetchSlotInst.binaryInstruction || 0).toString(16).padStart(8, '0')}`;
                fetchSlotInst.fetchInProgress = false; // Mark fetch as complete
                // Determine if the fetched data represents a valid instruction or should be treated as a bubble
                fetchSlotInst.isBubble = (fetchSlotInst.binaryInstruction === null || fetchSlotInst.binaryInstruction === undefined);
                fetchSlotInst.isStalled = false; // Explicitly unstall on successful fetch completion
            } else if (fetchResult.status === 'error') {
                 // --- LOGGING: Fetch error ---
                console.error(`Cycle ${pipeline.clockCycle}: Fetch Stage - Error fetching instruction for PC ${fetchSlotInst.pc} (ID:${fetchSlotInst.id}): ${fetchResult.message}`);
                 // --- END LOGGING ---
                // Fetch resulted in an error
                fetchSlotInst.fetchInProgress = false;
                fetchSlotInst.fetchError = fetchResult.message;
                fetchSlotInst.isBubble = true; // Treat as error/bubble
                pipeline.isHalted = true; // Halt on memory error
                memorySystem.clearRequestResult(`Workspace_inst_${fetchSlotInst.id}`); // Clean up memory system state
            } else {
                 // --- LOGGING: Fetch pending/busy ---
                 console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Still pending/busy for ID ${fetchSlotInst.id} (PC ${fetchSlotInst.pc}). Status: ${fetchResult.status}`);
                 // --- END LOGGING ---
                 // Fetch is still ongoing (e.g., 'wait', 'busy')
                 fetchSlotInst.isStalled = true; // Remain stalled while waiting
            }
        } else { // No result status available yet from memory system
             // --- LOGGING: No result yet, considering retry ---
             console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - No result yet for ID ${fetchSlotInst.id} (PC ${fetchSlotInst.pc}). Checking for retry possibility.`);
             // --- END LOGGING ---

            // Check conditions for potentially retrying the read (this logic might depend heavily on memorySystem implementation)
            // Generally, only retry if no request is currently pending AND the memory system isn't busy for this request ID.
            if (!memorySystem.hasPendingRequest(`Workspace_inst_${fetchSlotInst.id}`) &&
                fetchSlotInst.pc < (pipeline.actualProgramLength || MAX_PROGRAM_SIZE) && // Ensure PC is valid
                !memorySystem.isBusyForStage(`Workspace_inst_${fetchSlotInst.id}`))
            {
                 // --- LOGGING: Retrying read ---
                 console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Retrying read for PC ${fetchSlotInst.pc} (ID: ${fetchSlotInst.id})`);
                 // --- END LOGGING ---
                 // Attempt to initiate the read again
                 const memReadStatusRetry = memorySystem.read(fetchSlotInst.pc, `Workspace_inst_${fetchSlotInst.id}`);
                 console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Retry memorySystem.read status:`, memReadStatusRetry); // Logging retry status

                 // If retry immediately fails or is busy, stay stalled
                 if (memReadStatusRetry.status === 'error' || memReadStatusRetry.status === 'busy') {
                     fetchSlotInst.isStalled = true;
                     if(memReadStatusRetry.status === 'error') {
                         console.error(`Cycle ${pipeline.clockCycle}: Fetch Stage - Error on retry for PC ${fetchSlotInst.pc}: ${memReadStatusRetry.message}`);
                         pipeline.isHalted = true;
                         fetchSlotInst.isBubble = true;
                         fetchSlotInst.fetchInProgress = false;
                     }
                 } else {
                      // If retry initiated successfully, ensure fetchInProgress is true and unstall (will wait for result again)
                      fetchSlotInst.fetchInProgress = true;
                      fetchSlotInst.isStalled = false; // Not stalled *yet*, waiting for retry result
                 }
            } else {
                 // --- LOGGING: Cannot retry ---
                 console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Cannot retry for ID ${fetchSlotInst.id}. HasPending: ${memorySystem.hasPendingRequest(`Workspace_inst_${fetchSlotInst.id}`)}, IsBusy: ${memorySystem.isBusyForStage(`Workspace_inst_${fetchSlotInst.id}`)}`);
                 // --- END LOGGING ---
                 // Cannot retry (request might still be pending, or memory busy)
                 fetchSlotInst.isStalled = true; // Stall if cannot retry and still waiting
            }
        }
    // Logic if the fetch stage holds an instruction that has completed fetching
    } else if (fetchSlotInst && !fetchSlotInst.fetchInProgress && !fetchSlotInst.isBubble && !fetchSlotInst.completed){
        // Instruction is fetched, not a bubble, and not completed yet -> ready to advance
        fetchSlotInst.isStalled = false; // Ensure it's not marked stalled if fetch completed
        // --- LOGGING: Ready for Decode ---
        console.log(`Cycle ${pipeline.clockCycle}: Fetch Stage - Inst ID ${fetchSlotInst.id} (PC ${fetchSlotInst.pc}) fetch complete, ready for Decode.`);
        // --- END LOGGING ---
    }
}

function doDecodeStage() {
    const inst = pipeline.stages[STAGE_DECODE];
    // Initial checks for empty stage, bubble, completed instruction, or fetch still in progress
    if (!inst || inst.isBubble || inst.completed || inst.fetchInProgress) {
        if (inst && inst.fetchInProgress) {
            inst.isStalled = true; // Stall if fetch hasn't finished for this instruction yet
        }
        // Log final state if it's a non-completed instruction being stalled due to fetch in progress
         if (inst && !inst.isBubble && !inst.completed) {
             console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}), OpCode: ${inst.opCode || 'Pre-Decode'}, isStalled: ${inst.isStalled} (Reason: Fetch in Progress or Initial State)`);
         }
        return; // Nothing more to do in Decode this cycle
    }

    // If we reach here, we have a non-bubble, potentially valid instruction whose fetch is complete
    if (inst.binaryInstruction === null || inst.binaryInstruction === undefined) {
        // Double-check if it somehow became a bubble after fetch (e.g., memory read error resolved late)
        inst.isBubble = true; inst.opCode = "NOP";
        console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}) became Bubble, isStalled: false`);
        return;
    }

    inst.isStalled = false; // Reset stall flag for this cycle's processing

    // Handle pipeline squash signal from Execute stage
    if (pipeline.squashFetchDecode) {
        const bubble = new PipelineInstruction(null, -1); // Replace current instruction with a bubble
        bubble.isBubble = true; bubble.completed = true;
        pipeline.stages[STAGE_DECODE] = bubble;
        pipeline.squashFetchDecode = false; // Consume the squash signal for this stage
        console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Squashing Inst ID ${inst.id}, inserting bubble.`);
        return; // Don't decode the original instruction
    }

    // --- Start Decoding ---
    const binary = inst.binaryInstruction;
    const typeBits = (binary & MASK_TYPE) >>> SHIFT_TYPE;
    // Reset fields before decoding
    inst.rd = null; inst.rn = null; inst.rm = null; inst.immediate = null; inst.hasWriteback = false;

    try {
        // Decode based on instruction type bits (Arithmetic, Memory, Control)
        switch (typeBits) {
            case BIN_TYPE_ARITHMETIC:
                inst.type = INSTRUCTION_TYPE_ALU_STR;
                const arithOp = (binary & MASK_ARITH_OPCODE) >>> SHIFT_ARITH_OPCODE;
                inst.opCodeVal = arithOp;
                // Decode specific arithmetic opcodes... (Full decoding logic as in your original file)
                if (arithOp === 0b00000) { inst.opCode = 'ADD'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b00001) { inst.opCode = 'ADDS'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b00010) { inst.opCode = 'ADDI'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = signExtend(binary & MASK_ARITH_IMM15, 15); inst.hasWriteback = true; }
                else if (arithOp === 0b00011) { inst.opCode = 'ADDIS'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = signExtend(binary & MASK_ARITH_IMM15, 15); inst.hasWriteback = true; }
                else if (arithOp === 0b00100) { inst.opCode = 'SUB'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b00101) { inst.opCode = 'SUBS'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b00110) { inst.opCode = 'SUBI'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = signExtend(binary & MASK_ARITH_IMM15, 15); inst.hasWriteback = true; }
                else if (arithOp === 0b00111) { inst.opCode = 'SUBIS'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = signExtend(binary & MASK_ARITH_IMM15, 15); inst.hasWriteback = true; }
                else if (arithOp === 0b01000) { inst.opCode = 'MUL'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b01100) { inst.opCode = 'AND'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b01101) { inst.opCode = 'ANDI'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = (binary & MASK_ARITH_IMM15); inst.hasWriteback = true; }
                else if (arithOp === 0b01110) { inst.opCode = 'OR'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b01111) { inst.opCode = 'ORI'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = (binary & MASK_ARITH_IMM15); inst.hasWriteback = true; }
                else if (arithOp === 0b10000) { inst.opCode = 'XOR'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.rd = (binary & MASK_ARITH_RD_R_TYPE) >>> SHIFT_ARITH_RD_R_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b10001) { inst.opCode = 'XORI'; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.immediate = (binary & MASK_ARITH_IMM15); inst.hasWriteback = true; }
                else if (arithOp === 0b10010) { inst.opCode = 'SHL'; inst.rd = (binary & MASK_SHIFT_ACC_RD) >>> SHIFT_SHIFT_ACC_RD; inst.rn = inst.rd; inst.immediate = (binary & MASK_SHIFT_IMM5) >>> SHIFT_SHIFT_IMM5; inst.hasWriteback = true; }
                else if (arithOp === 0b10011) { inst.opCode = 'SHR'; inst.rd = (binary & MASK_SHIFT_ACC_RD) >>> SHIFT_SHIFT_ACC_RD; inst.rn = inst.rd; inst.immediate = (binary & MASK_SHIFT_IMM5) >>> SHIFT_SHIFT_IMM5; inst.hasWriteback = true; }
                else if (arithOp === 0b10100) { inst.opCode = 'CMP'; inst.rn = (binary & MASK_ARITH_RN_R_TYPE) >>> SHIFT_ARITH_RN_R_TYPE; inst.rm = (binary & MASK_ARITH_RM_R_TYPE) >>> SHIFT_ARITH_RM_R_TYPE; inst.hasWriteback = false; }
                else if (arithOp === 0b10111) { inst.opCode = 'MOV'; inst.rd = (binary & MASK_ARITH_RD_I_TYPE) >>> SHIFT_ARITH_RD_I_TYPE; inst.rn = (binary & MASK_ARITH_RN_I_TYPE) >>> SHIFT_ARITH_RN_I_TYPE; inst.hasWriteback = true; }
                else if (arithOp === 0b11000) { inst.opCode = 'MOVI'; inst.rd = (binary & MASK_MOVI_RD) >>> SHIFT_MOVI_RD; inst.immediate = signExtend(binary & MASK_MOVI_IMM20, 20); inst.hasWriteback = true; }
                else { throw new Error(`Unsupported Arithmetic OpCodeVal: 0b${arithOp.toString(2)} from binary 0x${binary.toString(16)}`); }
                break;
            case BIN_TYPE_MEMORY:
                inst.type = INSTRUCTION_TYPE_MEMORY_STR;
                const memOp = (binary & MASK_MEM_OPCODE) >>> SHIFT_MEM_OPCODE;
                inst.opCodeVal = memOp;
                inst.rn = (binary & MASK_MEM_RN) >>> SHIFT_MEM_RN;
                inst.rd = (binary & MASK_MEM_RD) >>> SHIFT_MEM_RD;
                inst.immediate = signExtend(binary & MASK_MEM_OFFSET18, 18);
                if (memOp === 0b00) { inst.opCode = 'LOAD'; inst.hasWriteback = true; }
                else if (memOp === 0b01) { inst.opCode = 'STR'; inst.hasWriteback = false; }
                else { throw new Error(`Unsupported Memory OpCodeVal: 0b${memOp.toString(2)} from binary 0x${binary.toString(16)}`); }
                break;
            case BIN_TYPE_CONTROL:
                inst.type = INSTRUCTION_TYPE_CONTROL_STR;
                const ctrlOp = (binary & MASK_CTRL_OPCODE) >>> SHIFT_CTRL_OPCODE;
                inst.opCodeVal = ctrlOp;
                inst.hasWriteback = false;
                if (ctrlOp === 0b000) { inst.opCode = 'JMP'; inst.rn = (binary & MASK_CTRL_RN_JMP) >>> SHIFT_CTRL_RN_JMP; }
                else if (ctrlOp === 0b001) { inst.opCode = 'BEQ'; inst.immediate = signExtend(binary & MASK_CTRL_OFFSET27_BEQ, 27); }
                else if (ctrlOp === 0b010) { inst.opCode = 'BLT'; inst.rn = (binary & MASK_CTRL_RN_BLT_CAL_FLUSH) >>> SHIFT_CTRL_RN_BLT_CAL_FLUSH; inst.immediate = signExtend(binary & MASK_CTRL_OFFSET22_BLT_CAL, 22); }
                else if (ctrlOp === 0b100) { inst.opCode = 'CAL'; inst.rn = (binary & MASK_CTRL_RN_BLT_CAL_FLUSH) >>> SHIFT_CTRL_RN_BLT_CAL_FLUSH; inst.immediate = signExtend(binary & MASK_CTRL_OFFSET22_BLT_CAL, 22); inst.hasWriteback = true; inst.rd = 31; } // CAL writes link register R31
                else if (ctrlOp === 0b101) { inst.opCode = 'FLUSH'; inst.rn = (binary & MASK_CTRL_RN_BLT_CAL_FLUSH) >>> SHIFT_CTRL_RN_BLT_CAL_FLUSH; }
                else { throw new Error(`Unsupported Control OpCodeVal: 0b${ctrlOp.toString(2)} from binary 0x${binary.toString(16)}`); }
                break;
            default:
                throw new Error(`Unknown instruction type bits: 0b${typeBits.toString(2)} from binary 0x${binary.toString(16)}`);
        }
    } catch (e) {
        // Handle decoding errors
        console.error(`Cycle ${pipeline.clockCycle}: Error decoding binary 0x${(binary||0).toString(16)} (ID:${inst.id}, PC:${inst.pc}): ${e.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `Decode Error: Binary 0x${(binary||0).toString(16)} - ${e.message}`);
        inst.opCode = "NOP_ERR_DEC"; inst.isBubble = true; pipeline.isHalted = true;
        console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}) caused Decode Error, isStalled: false (now bubble)`);
        return;
    }

    // --- Data Hazard Detection & Operand Fetch ---
    // Check only if the instruction reads registers (Control instructions like BEQ don't read GPRs here)
    if (inst.type !== INSTRUCTION_TYPE_CONTROL_STR || ['JMP', 'BLT', 'CAL', 'FLUSH'].includes(inst.opCode) ) { // JMP/BLT/CAL/FLUSH read Rn
        let hazardDetected = false;
        const registersToRead = [];
        if (inst.rn !== null && inst.rn !== undefined) registersToRead.push(inst.rn);
        if (inst.rm !== null && inst.rm !== undefined) registersToRead.push(inst.rm);
        // STR instruction reads Rd for the value to store
        if (inst.opCode === 'STR') {
             if (inst.rd !== null && inst.rd !== undefined) registersToRead.push(inst.rd);
        }

        for (const regNum of registersToRead) {
            const exInst = pipeline.stages[STAGE_EXECUTE];
            const memInst = pipeline.stages[STAGE_MEMORY];
            // Check against instruction in Execute stage
            if (exInst && exInst.hasWriteback && exInst.rd === regNum && !exInst.isBubble && !exInst.completed) {
                hazardDetected = true; break;
            }
            // Check against instruction in Memory stage
            if (memInst && memInst.hasWriteback && memInst.rd === regNum && !memInst.isBubble && !memInst.completed) {
                 // Exception: If MEM instruction is a LOAD writing to the same register this instruction reads,
                 // but the data hasn't been loaded yet (memOpCompleted is false), it's a RAW hazard through memory.
                if (memInst.opCode === 'LOAD' && !memInst.memOpCompleted) {
                    hazardDetected = true; break;
                }
                // If it's not a LOAD or the LOAD has completed, we assume forwarding handles it or WB happens before next read.
                // More sophisticated forwarding logic would be needed for full accuracy. Let's assume basic stall for now.
                 hazardDetected = true; break; // Simplified: Stall if MEM stage writes the register.

            }
        }

        if (hazardDetected) {
            inst.isStalled = true; // Set stall flag due to data hazard
            // --- LOGGING (Decode End) ---
            if (inst && !inst.isBubble) {
                console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}), OpCode: ${inst.opCode}, isStalled: ${inst.isStalled} (Reason: Data Hazard)`);
            }
             // --- End Logging ---
            return; // Stop processing Decode for this instruction this cycle
        }

        // If no hazard, fetch register values needed for Execute stage
        try {
            if (inst.rn !== null && inst.rn !== undefined) inst.rnValue = registers.read(inst.rn);
            if (inst.rm !== null && inst.rm !== undefined) inst.rmValue = registers.read(inst.rm);
            // Fetch Rd value if it's a STR instruction
            if (inst.opCode === 'STR') {
                if (inst.rd !== null && inst.rd !== undefined) inst.rdValueForStore = registers.read(inst.rd);
            }
        } catch (e) {
            // Handle register read errors
            console.error(`Cycle ${pipeline.clockCycle}: Error reading register for ID:${inst.id} ("${inst.opCode}") in Decode: ${e.message}`);
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `Reg Read Error: ${inst.opCode} - ${e.message}`);
            inst.isBubble = true; pipeline.isHalted = true;
             // --- LOGGING (Decode End) ---
            if (inst && !inst.isBubble) { // Log before marking as bubble if possible
                console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}), OpCode: ${inst.opCode}, isStalled: false (Reason: Reg Read Error -> Bubble)`);
            }
             // --- End Logging ---
            return;
        }
    }

    // --- LOGGING (Decode End) ---
    // Log final state for instructions that successfully completed Decode this cycle
    if (inst && !inst.isBubble) {
        console.log(`Cycle ${pipeline.clockCycle}: doDecodeStage - END - Inst ID ${inst.id} (PC ${inst.pc}), OpCode: ${inst.opCode}, isStalled: ${inst.isStalled} (Reason: OK/Completed Decode)`);
    }
    // --- End Logging ---
}

function doExecuteStage() {
    const inst = pipeline.stages[STAGE_EXECUTE];
    if (!inst || inst.isBubble || inst.completed || inst.fetchInProgress) {
         if (inst && inst.fetchInProgress) inst.isStalled = true;
        return;
    }
    inst.isStalled = false; inst.branchTaken = false;
    try {
        switch (inst.opCode) {
            case 'ADD': case 'ADDS': inst.aluResult = inst.rnValue + inst.rmValue; inst.writebackValue = inst.aluResult; if(inst.opCode.endsWith('S')) registers.updateFlags(inst.aluResult); break;
            case 'ADDI': case 'ADDIS': inst.aluResult = inst.rnValue + inst.immediate; inst.writebackValue = inst.aluResult; if(inst.opCode.endsWith('S')) registers.updateFlags(inst.aluResult); break;
            case 'SUB': case 'SUBS': inst.aluResult = inst.rnValue - inst.rmValue; inst.writebackValue = inst.aluResult; if(inst.opCode.endsWith('S') || inst.opCode === 'CMP') registers.updateFlags(inst.aluResult); break;
            case 'SUBI': case 'SUBIS': inst.aluResult = inst.rnValue - inst.immediate; inst.writebackValue = inst.aluResult; if(inst.opCode.endsWith('S')) registers.updateFlags(inst.aluResult); break;
            case 'MUL': inst.aluResult = inst.rnValue * inst.rmValue; inst.writebackValue = inst.aluResult; break;
            case 'AND': inst.aluResult = inst.rnValue & inst.rmValue; inst.writebackValue = inst.aluResult; break;
            case 'ANDI': inst.aluResult = inst.rnValue & inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'OR': inst.aluResult = inst.rnValue | inst.rmValue; inst.writebackValue = inst.aluResult; break;
            case 'ORI': inst.aluResult = inst.rnValue | inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'XOR': inst.aluResult = inst.rnValue ^ inst.rmValue; inst.writebackValue = inst.aluResult; break;
            case 'XORI': inst.aluResult = inst.rnValue ^ inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'SHL': inst.aluResult = inst.rnValue << inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'SHR': inst.aluResult = inst.rnValue >>> inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'CMP': inst.aluResult = inst.rnValue - inst.rmValue; registers.updateFlags(inst.aluResult); break;
            case 'LOAD': inst.memoryAddress = inst.rnValue + inst.immediate; break;
            case 'STR': inst.memoryAddress = inst.rnValue + inst.immediate; inst.dataToStore = inst.rdValueForStore; break;
            case 'MOV': inst.aluResult = inst.rnValue; inst.writebackValue = inst.aluResult; break;
            case 'MOVI': inst.aluResult = inst.immediate; inst.writebackValue = inst.aluResult; break;
            case 'JMP': inst.branchTaken = true; inst.branchTargetPC = inst.rnValue; PC.write(inst.branchTargetPC); pipeline.squashFetchDecode = true; break;
            case 'BEQ': const flagsBEQ = registers.getFlags(); if (flagsBEQ.ZF) { inst.branchTaken = true; inst.branchTargetPC = (inst.pc + 1) + inst.immediate; PC.write(inst.branchTargetPC); pipeline.squashFetchDecode = true; } break;
            case 'BLT': const flagsBLT = registers.getFlags(); if (flagsBLT.NF) { inst.branchTaken = true; inst.branchTargetPC = inst.rnValue + inst.immediate; PC.write(inst.branchTargetPC); pipeline.squashFetchDecode = true; } break;
            case 'CAL': inst.branchTaken = true; registers.write(31, inst.pc + 1); inst.branchTargetPC = inst.rnValue + inst.immediate; PC.write(inst.branchTargetPC); pipeline.squashFetchDecode = true; break;
            case 'FLUSH': inst.memoryAddress = inst.rnValue; break;
            default: break;
        }
    } catch (e) {
        console.error(`Cycle ${pipeline.clockCycle}: Error in Execute for ID:${inst.id} ("${inst.opCode || inst.rawInstruction}"): ${e.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `Execute Error: ${inst.opCode || inst.rawInstruction} - ${e.message}`);
        inst.isBubble = true; pipeline.isHalted = true;
    }
}

function doMemoryStage() {
    const inst = pipeline.stages[STAGE_MEMORY];
    if (!inst || inst.isBubble || inst.completed || inst.fetchInProgress) {
        if (inst && inst.fetchInProgress) inst.isStalled = true; return;
    }
    inst.isStalled = false;
    if (inst.type === INSTRUCTION_TYPE_CONTROL_STR && inst.branchTaken) { inst.memOpCompleted = true; return; }
    if (inst.opCode === 'FLUSH') {
        const cacheIndex = memorySystem.cache.getIndex(inst.memoryAddress);
        const cacheTag = memorySystem.cache.getTag(inst.memoryAddress);
        if (cacheIndex !== -1 && memorySystem.cache.cache[cacheIndex] && memorySystem.cache.cache[cacheIndex].valid && memorySystem.cache.cache[cacheIndex].tag === cacheTag) {
            memorySystem.cache.cache[cacheIndex].valid = 0; memorySystem.cache.cache[cacheIndex].tag = -1;
        }
        inst.memOpCompleted = true; return;
    }
    const stageId = `mem_stage_inst_${inst.id}`;
    if (inst.type === INSTRUCTION_TYPE_MEMORY_STR) {
        let opInitiatedThisCycle = false;
        if (!memorySystem.hasPendingRequest(stageId) && !inst.memOpCompleted) {
            if (inst.opCode === 'LOAD') { memorySystem.read(inst.memoryAddress, stageId); opInitiatedThisCycle = true; }
            else if (inst.opCode === 'STR') { memorySystem.write(inst.memoryAddress, inst.dataToStore, stageId); opInitiatedThisCycle = true; }
        }
        memorySystem.processCycle();
        const memResult = memorySystem.getRequestResult(stageId);
        if (memResult) {
            if (memResult.status === 'done') {
                if (inst.opCode === 'LOAD') { inst.dataLoaded = memResult.data; inst.writebackValue = inst.dataLoaded; }
                inst.memOpCompleted = true;
            } else if (memResult.status === 'error') {
                console.error(`Cycle ${pipeline.clockCycle}: Memory Error for ID:${inst.id} Addr ${inst.memoryAddress}: ${memResult.message}`);
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `Mem Error (${inst.opCode} ID:${inst.id}): ${memResult.message}`);
                inst.isBubble = true; pipeline.isHalted = true; memorySystem.clearRequestResult(stageId);
            }
        } else if (memorySystem.hasPendingRequest(stageId)) {
            inst.isStalled = true;
        } else if (inst.type === INSTRUCTION_TYPE_MEMORY_STR && !inst.memOpCompleted && !opInitiatedThisCycle) {
            inst.isStalled = true;
            const memReadStatusRetry = (inst.opCode === 'LOAD') ? memorySystem.read(inst.memoryAddress, stageId) : memorySystem.write(inst.memoryAddress, inst.dataToStore, stageId);
             if (memReadStatusRetry.status === 'error' || memReadStatusRetry.status === 'busy') { /* Stall already true */ }
        }
    } else { inst.memOpCompleted = true; }
}

function doWriteBackStage() {
    const inst = pipeline.stages[STAGE_WRITEBACK];
    if (!inst || inst.isBubble || inst.completed || inst.fetchInProgress ) {
        if (inst && inst.fetchInProgress) inst.isStalled = true; return;
    }
    inst.isStalled = false;
    if (inst.type === INSTRUCTION_TYPE_CONTROL_STR && (inst.branchTaken || inst.opCode === 'FLUSH')) {
        inst.completed = true; pipeline.instructionsCompleted++; return;
    }
    if (inst.hasWriteback && inst.writebackValue !== undefined && inst.writebackValue !== null) {
        try {
            if (inst.opCode !== 'CAL' && inst.rd !== null && inst.rd !== undefined) {
                 registers.write(inst.rd, inst.writebackValue);
            }
        } catch (e) {
            console.error(`Cycle ${pipeline.clockCycle}: Error in WriteBack for ID:${inst.id} Rd:${inst.rd}: ${e.message}`);
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `WB Error (ID:${inst.id}): ${e.message}`);
            pipeline.isHalted = true;
        }
    }
    inst.completed = true; pipeline.instructionsCompleted++;
}

function advancePipelineStages() {
    // --- WriteBack Stage ---
    // Clear WB if the instruction there is completed
    if (pipeline.stages[STAGE_WRITEBACK] && pipeline.stages[STAGE_WRITEBACK].completed) {
        // --- LOGGING ---
        console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Clearing WB Stage (was ID ${pipeline.stages[STAGE_WRITEBACK].id})`);
        // --- END LOGGING ---
        pipeline.stages[STAGE_WRITEBACK] = null;
    }

    // --- Memory Stage to WriteBack ---
    const memInst = pipeline.stages[STAGE_MEMORY];
    // --- LOGGING ---
    if(memInst) {
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking MEM->WB: Inst ID ${memInst.id}, Stalled: ${memInst.isStalled}, InProgress: ${memInst.fetchInProgress}, Completed: ${memInst.completed}, Bubble: ${memInst.isBubble}, MemOpDone: ${memInst.memOpCompleted}, Type: ${memInst.type}. WB Stage: ${pipeline.stages[STAGE_WRITEBACK] === null ? 'Empty' : `Busy (ID ${pipeline.stages[STAGE_WRITEBACK]?.id})`}`);
    } else {
        console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking MEM->WB: Memory stage is Empty.`);
    }
    // --- END LOGGING ---
    // Conditions to advance from MEM: exists, not stalled, not fetching, AND (is bubble OR mem op done OR not a memory op OR is a control op that finished its action)
    if (memInst && !memInst.isStalled && !memInst.fetchInProgress &&
        (memInst.isBubble || memInst.memOpCompleted || memInst.type !== INSTRUCTION_TYPE_MEMORY_STR || (memInst.type === INSTRUCTION_TYPE_CONTROL_STR && (memInst.branchTaken || memInst.opCode === 'FLUSH'))) )
    {
        if (pipeline.stages[STAGE_WRITEBACK] === null) { // If WB is free
            // --- LOGGING ---
            console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Moving MEM->WB: Inst ID ${memInst.id}`);
            // --- END LOGGING ---
            pipeline.stages[STAGE_WRITEBACK] = memInst;
            pipeline.stages[STAGE_MEMORY] = null;
        } else {
             // --- LOGGING ---
             console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - STALL MEM->WB: WB busy. MEM ID ${memInst?.id}, WB ID ${pipeline.stages[STAGE_WRITEBACK]?.id}`);
             // --- END LOGGING ---
             // Stall is implicit
        }
    }

    // --- Execute Stage to Memory ---
    const exInst = pipeline.stages[STAGE_EXECUTE];
     // --- LOGGING ---
    if(exInst) {
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking EX->MEM: Inst ID ${exInst.id}, Stalled: ${exInst.isStalled}, InProgress: ${exInst.fetchInProgress}, Completed: ${exInst.completed}, Bubble: ${exInst.isBubble}. MEM Stage: ${pipeline.stages[STAGE_MEMORY] === null ? 'Empty' : `Busy (ID ${pipeline.stages[STAGE_MEMORY]?.id})`}`);
    } else {
        console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking EX->MEM: Execute stage is Empty.`);
    }
    // --- END LOGGING ---
    // ***** CORRECTED LOGIC FOR BUBBLES *****
    // Conditions to advance from EX: exists, not stalled, not fetching, AND (it's NOT completed OR it IS a completed BUBBLE)
    if (exInst && !exInst.isStalled && !exInst.fetchInProgress &&
        (!exInst.completed || (exInst.completed && exInst.isBubble)) ) // <<< Allow completed bubbles to advance
    {
        if (pipeline.stages[STAGE_MEMORY] === null) { // If MEM is free
            // --- LOGGING ---
            console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Moving EX->MEM: Inst ID ${exInst.id}`);
            // --- END LOGGING ---
            pipeline.stages[STAGE_MEMORY] = exInst;
            pipeline.stages[STAGE_EXECUTE] = null;
        } else {
             // --- LOGGING ---
             console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - STALL EX->MEM: MEM busy. EX ID ${exInst?.id}, MEM ID ${pipeline.stages[STAGE_MEMORY]?.id}`);
             // --- END LOGGING ---
             // Stall is implicit
        }
    }
     // ***** END CORRECTION *****


    // --- Decode Stage to Execute ---
    const decInst = pipeline.stages[STAGE_DECODE];
    // --- LOGGING ---
    if (decInst) {
        console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking DEC->EX: Inst ID ${decInst.id}, Stalled: ${decInst.isStalled}, InProgress: ${decInst.fetchInProgress}, Completed: ${decInst.completed}, Bubble: ${decInst.isBubble}. EX Stage: ${pipeline.stages[STAGE_EXECUTE] === null ? 'Empty' : `Busy (ID ${pipeline.stages[STAGE_EXECUTE]?.id})`}`);
    } else {
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking DEC->EX: Decode stage is Empty.`);
    }
    // --- END LOGGING ---
    // Conditions to advance from DEC: exists, not stalled, not fetching, AND (it's NOT completed OR it IS a completed BUBBLE)
    if (decInst && !decInst.isStalled && !decInst.fetchInProgress &&
        (!decInst.completed || (decInst.completed && decInst.isBubble)) ) // <<< Allow completed bubbles to advance
    {
        if (pipeline.stages[STAGE_EXECUTE] === null) { // If EX is free
            // --- LOGGING ---
            console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Moving DEC->EX: Inst ID ${decInst.id}`);
            // --- END LOGGING ---
            pipeline.stages[STAGE_EXECUTE] = decInst;
            pipeline.stages[STAGE_DECODE] = null;
        } else {
            // --- LOGGING ---
             console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - STALL DEC->EX: EX busy. DEC ID ${decInst?.id}, EX ID ${pipeline.stages[STAGE_EXECUTE]?.id}`);
            // --- END LOGGING ---
            // Stall is implicit because Decode isn't cleared
        }
    }

    // --- Fetch Stage to Decode ---
    const fetchInst = pipeline.stages[STAGE_FETCH];
     // --- LOGGING ---
    if (fetchInst) {
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking FE->DEC: Inst ID ${fetchInst.id}, Stalled: ${fetchInst.isStalled}, InProgress: ${fetchInst.fetchInProgress}, Completed: ${fetchInst.completed}, Bubble: ${fetchInst.isBubble}. DEC Stage: ${pipeline.stages[STAGE_DECODE] === null ? 'Empty' : `Busy (ID ${pipeline.stages[STAGE_DECODE]?.id})`}`);
    } else {
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Checking FE->DEC: Fetch stage is Empty.`);
    }
     // --- END LOGGING ---
    // Conditions to check Fetch: exists, fetch is NOT in progress, AND not already completed
    if (fetchInst && !fetchInst.fetchInProgress && !fetchInst.completed) {
        if (pipeline.stages[STAGE_DECODE] === null) { // If DEC is free
             // --- LOGGING ---
             console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - Moving FE->DEC: Inst ID ${fetchInst.id}`);
             // --- END LOGGING ---
            fetchInst.isStalled = false; // Ensure it's unstalled before moving
            pipeline.stages[STAGE_DECODE] = fetchInst;
            pipeline.stages[STAGE_FETCH] = null;
        } else { // Decode stage is busy
            // Stall Fetch only if it's a real instruction waiting
            if (!fetchInst.isBubble) {
                 fetchInst.isStalled = true;
                 // --- LOGGING ---
                 console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - STALL FE->DEC: DEC busy. Fetch ID ${fetchInst?.id}, DEC ID ${pipeline.stages[STAGE_DECODE]?.id}`);
                 // --- END LOGGING ---
            }
        }
    } else if (fetchInst && fetchInst.fetchInProgress) {
        // If fetch is still in progress, ensure it's marked stalled so it doesn't advance prematurely
        fetchInst.isStalled = true;
         // --- LOGGING ---
         console.log(`Cycle ${pipeline.clockCycle}: advancePipelineStages - STALL FE->DEC: Fetch In Progress. Fetch ID ${fetchInst?.id}`);
         // --- END LOGGING ---
    }
}

function processOneClockCycle() {
    if (pipeline.isHalted && !pipeline.stages.some(s => s && !s.completed && !s.isBubble && !s.fetchInProgress)) {
        if (simulationRunning) {
            simulationRunning = false;
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-complete', "Program halted or finished.");
        }
        return;
    }
    pipeline.clockCycle++;
    doWriteBackStage(); doMemoryStage(); doExecuteStage(); doDecodeStage();
    advancePipelineStages();
    if (!pipeline.isHalted) { doFetchStage(); }
    updateGUI();

    const noActiveInstructions = pipeline.stages.every(s => s === null || s.isBubble || s.completed || (s.fetchInProgress && s.pc >= pipeline.actualProgramLength && pipeline.actualProgramLength > 0));
    const programCounterPastEnd = PC.read() >= pipeline.actualProgramLength && pipeline.actualProgramLength > 0;

    if (!pipeline.isHalted && programCounterPastEnd && noActiveInstructions) {
        const anyRealWorkLeft = pipeline.stages.some(s => s && !s.isBubble && !s.completed && s.pc < pipeline.actualProgramLength);
        if (!anyRealWorkLeft) {
            console.log(`Program seems complete: PC (${PC.read()}) at/past end (${pipeline.actualProgramLength}) and pipeline drained of valid program instructions.`);
            pipeline.isHalted = true;
        }
    }
    
    if (pipeline.isHalted && !pipeline.stages.some(s => s && !s.completed && !s.isBubble && !s.fetchInProgress)) {
         if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-complete', "Program finished or halted.");
         simulationRunning = false;
    }
}

function updateGUI() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pipelineStateForUI = {
      fetch: pipeline.stages[STAGE_FETCH] ? (pipeline.stages[STAGE_FETCH].fetchInProgress ? `Workspaceing PC:${pipeline.stages[STAGE_FETCH].pc} (ID:${pipeline.stages[STAGE_FETCH].id})` : pipeline.getStageContent(STAGE_FETCH)) : "Empty",
      decode: pipeline.getStageContent(STAGE_DECODE),
      execute: pipeline.getStageContent(STAGE_EXECUTE),
      memory: pipeline.getStageContent(STAGE_MEMORY),
      writeBack: pipeline.getStageContent(STAGE_WRITEBACK),
      clockCycle: pipeline.clockCycle,
      instructionsCompleted: pipeline.instructionsCompleted,
      pc: PC.read(),
  };
  const stateData = {
    pipeline: pipelineStateForUI, registers: registers.getAllRegisters(),
    programCounter: PC.read(), memory: memorySystem.getMemorySnapshot(0, 64),
    cacheStats: memorySystem.getStats(), flags: registers.getFlags(),
  };
  try { mainWindow.webContents.send('update-state', stateData); }
  catch (error) { console.error("Error sending update to renderer:", error); }
}

function loadInstructionsFromFile(filename) {
  try {
    const filePath = path.join(__dirname, filename);
    if (!fs.existsSync(filePath)) { throw new Error(`Instruction file not found: ${filename} (in ${filePath})`); }
    const data = fs.readFileSync(filePath, 'utf8');
    return data.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith("//") && !line.startsWith("#"));
  } catch (err) {
    console.error(`Error reading instruction file: ${err}`);
    if (mainWindow && !mainWindow.isDestroyed()){ mainWindow.webContents.send('simulation-error', `Failed to load ${filename}: ${err.message}`); }
    return [];
  }
}

// --- Electron App Setup ---
function createWindowElectron() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false, devTools: true }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindowElectron);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { app.quit(); } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindowElectron(); } });


// --- IPC Handlers ---
ipcMain.on('start-simulation', (event, fileName = 'instructions.txt') => {
  console.log(`Received 'start-simulation' request for ${fileName}.`);
  resetSimulationState();
  const instructionStrings = loadInstructionsFromFile(fileName);

  if (instructionStrings.length > 0) {
      const machineCode = [];
      globalThis.rawAsmForDebug = [];

      for (let i = 0; i < instructionStrings.length; i++) {
          const asmLine = instructionStrings[i];
          if (asmLine.endsWith(':')) {
              globalThis.rawAsmForDebug.push({idx: i, pc: -1, asm: asmLine, binary: null, error: "Skipped label definition"});
              continue;
          }
          try {
              const binaryInstr = assembleInstruction(asmLine);
              if (binaryInstr !== null && binaryInstr !== undefined) {
                  machineCode.push(binaryInstr);
                  globalThis.rawAsmForDebug.push({idx: i, pc: machineCode.length -1, asm: asmLine, binary: `0x${binaryInstr.toString(16).padStart(8,'0')}` });
              } else if (asmLine && !asmLine.startsWith("//") && !asmLine.startsWith("#")) {
                  console.warn(`Assembler returned null for non-comment/empty line: "${asmLine}"`);
                  globalThis.rawAsmForDebug.push({idx: i, pc: -1, asm: asmLine, binary: null, error: "Assembler returned null unexpectedly for valid looking line"});
              } else {
                   globalThis.rawAsmForDebug.push({idx: i, pc: -1, asm: asmLine, binary: null, error: "Skipped by assembler (comment/empty)"});
              }
          } catch (e) {
              console.error(`Assembly Error on line ${i + 1} ("${asmLine}"): ${e.message}`);
              if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('simulation-error', `Assembly Error (line ${i+1}: "${asmLine}"): ${e.message}`);
              }
              pipeline.isHalted = true;
              globalThis.rawAsmForDebug.push({idx: i, pc: -1, asm: asmLine, binary: null, error: e.message});
              updateGUI(); return;
          }
      }

      if (pipeline.isHalted) return;

      pipeline.actualProgramLength = machineCode.length; // Set actual program length
      console.log(`Assembled ${pipeline.actualProgramLength} instructions into machine code.`);

      let currentWordAddress = 0;
      for (const instructionWord of machineCode) {
          if (currentWordAddress >= MAX_PROGRAM_SIZE) {
              console.error("Program too large for available memory space.");
              if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', "Program too large for memory.");
              pipeline.isHalted = true; break;
          }
          const wordsPerLineVal = (memorySystem.memory.data[0] && memorySystem.memory.data[0].length > 0) ? memorySystem.memory.data[0].length : 1;
          const lineIndex = Math.floor(currentWordAddress / wordsPerLineVal);
          const offsetInLine = currentWordAddress % wordsPerLineVal;

          if (lineIndex < memorySystem.memory.data.length && memorySystem.memory.data[lineIndex]) {
              memorySystem.memory.data[lineIndex][offsetInLine] = instructionWord;
          } else {
               console.error(`Memory write error: Calculated lineIndex ${lineIndex} (max: ${memorySystem.memory.data.length -1 }) or offsetInLine ${offsetInLine} (max: ${wordsPerLineVal-1}) out of bounds while loading program word ${currentWordAddress}.`);
               pipeline.isHalted = true; break;
          }
          currentWordAddress++;
      }
      if (pipeline.isHalted) { updateGUI(); return; }
  } else {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-error', `No instruction strings loaded from ${fileName}.`);
      pipeline.actualProgramLength = 0;
  }
  updateGUI();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('instructions-loaded', pipeline.actualProgramLength);
});

ipcMain.on('step-simulation', (event) => {
  if (!pipeline.isHalted || pipeline.stages.some(s => s && (!s.completed || s.fetchInProgress) && !s.isBubble )) {
      processOneClockCycle();
  } else {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-complete', "Simulation ended or halted.");
  }
});

ipcMain.on('run-simulation', (event) => {
    if (pipeline.isHalted && !pipeline.stages.some(s => s && (!s.completed || s.fetchInProgress) && !s.isBubble)) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simulation-complete', "Simulation ended or halted."); return;
    }
    simulationRunning = true;
    function run() {
        if (simulationRunning && (!pipeline.isHalted || pipeline.stages.some(s => s && (!s.completed || s.fetchInProgress) && !s.isBubble))) {
            processOneClockCycle(); setTimeout(run, 50);
        } else {
            simulationRunning = false;
            if (pipeline.isHalted && mainWindow && !mainWindow.isDestroyed()) {
                 mainWindow.webContents.send('simulation-complete', "Simulation ended or halted.");
            }
        }
    }
    run();
});

ipcMain.on('stop-simulation', (event) => { simulationRunning = false; console.log("Stop simulation requested."); });

ipcMain.on('reset-simulation', (event) => {
  resetSimulationState();
});

ipcMain.on('view-cache-line', (event, lineIndex) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const lineData = memorySystem.viewCache(lineIndex);
        mainWindow.webContents.send('cache-line-data', { index: lineIndex, data: lineData });
    }
});

ipcMain.on('view-memory-line', (event, lineIndex) => {
     if (mainWindow && !mainWindow.isDestroyed()) {
        const lineData = memorySystem.viewMemory(lineIndex);
        mainWindow.webContents.send('memory-line-data', { index: lineIndex, data: lineData });
    }
});