// pipeline.mjs
import { MemorySystem } from './cache-simulator.mjs';

export class Pipeline {
  constructor() {
    this.pipelineEnabled = false;
    this.registers = new Array(32).fill(0);
    this.pc = 0;
    this.stages = {
      fetch: { instruction: null },
      decode: { instruction: null },
      execute: { instruction: null },
      memory: { instruction: null },
      writeback: { instruction: null }
    };
    this.halted = false;
    this.cycles = 0;
    this.instructions = 0;
    this.stalls = 0;
    this.branchTaken = false;
    
    // Instruction opcodes - UPDATED to match test-binary-generator.js
    this.OPCODES = {
      // ALU operations (type 0)
      'ADD': 0b00000,
      'ADDI': 0b00010,
      'SUB': 0b00100,
      'SUBI': 0b00110,
      'AND': 0b01100,
      'OR': 0b01110,
      'XOR': 0b10000,
      'MOV': 0b10111,
      'MOVI': 0b11000,
      
      // Memory operations (type 1)
      'LOAD': 0b00,
      'STR': 0b01,
      
      // Control operations (type 2)
      'JMP': 0b000,
      'BEQ': 0b001,
      'BLT': 0b010,
      'CAL': 0b100
    };

    this.memorySystem = new MemorySystem();
  }

  enablePipeline(enabled) {
    this.pipelineEnabled = enabled;
    console.log(`Pipeline mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  clock() {
    this.cycles++;
    
    if (this.pipelineEnabled) {
      this.clockPipelined();
    } else {
      this.clockNonPipelined();
    }
    
    if (this.branchTaken) {
      this.branchTaken = false;
    }
  }

  clockPipelined() {
    // In pipelined mode, execute all stages in parallel
    // Process in reverse order to prevent data races
    this.processWritebackStage();
    this.processMemoryStage();
    this.processExecuteStage();
    this.processDecodeStage();
    this.processFetchStage();
  }

  clockNonPipelined() {
    // In non-pipelined mode, execute one complete instruction
    if (this.stages.writeback.instruction) {
      this.processWritebackStage();
      this.clearPipeline();
    } else if (this.stages.memory.instruction) {
      this.processMemoryStage();
    } else if (this.stages.execute.instruction) {
      this.processExecuteStage();
    } else if (this.stages.decode.instruction) {
      this.processDecodeStage();
    } else if (!this.halted) {
      // Only try to fetch if not halted
      this.processFetchStage();
    }
  }

  clearPipeline() {
    this.stages.fetch.instruction = null;
    this.stages.decode.instruction = null;
    this.stages.execute.instruction = null;
    this.stages.memory.instruction = null;
    this.stages.writeback.instruction = null;
  }

  // Direct memory access for fetch stage
  fetchInstruction(address) {
    const lineIndex = Math.floor(address / 16);
    const offset = address % 16;
    
    if (lineIndex < this.memorySystem.memory.data.length) {
      return this.memorySystem.memory.data[lineIndex][offset];
    }
    return 0; // Return 0 (halt) for invalid addresses
  }

  processFetchStage() {
    if (this.halted) {
      return;
    }
    
    // Read instruction from memory directly
    const instruction = this.fetchInstruction(this.pc);
    
    console.log(`Fetch: PC=${this.pc}, Instruction=0x${instruction.toString(16).padStart(8, '0')}`);
    
    // Halt on instruction = 0
    if (instruction === 0) {
      console.log("Fetch: Halt instruction detected");
      this.halted = true;
      return;
    }
    
    // Move to decode stage
    this.stages.decode.instruction = instruction;
    
    // Advance PC
    this.pc++;
  }

  processDecodeStage() {
    if (!this.stages.decode.instruction) return;
    
    const instruction = this.stages.decode.instruction;
    const type = (instruction >> 30) & 0x3;
    let opcode, rn, rm, rd, imm, offset;
    
    if (type === 0) { // ALU format
      // CRITICAL FIX: Updated the bit positions to match test-binary-generator.js
      opcode = (instruction >> 25) & 0x1F;
      rn = (instruction >> 20) & 0x1F;
      rm = (instruction >> 15) & 0x1F; 
      rd = (instruction >> 10) & 0x1F;
      imm = instruction & 0x7FFF;
      
      // Sign extend immediate if the MSB is set
      if (imm & 0x4000) {
        imm |= 0xFFFF8000; // Sign extend to 32 bits
      }
    } 
    else if (type === 1) { // Memory format
      opcode = (instruction >> 28) & 0x3;
      rn = (instruction >> 23) & 0x1F;
      rd = (instruction >> 18) & 0x1F;
      offset = instruction & 0x3FFFF;
      // Sign extend offset if needed
      if (offset & 0x20000) {
        offset |= 0xFFFC0000;
      }
    }
    else if (type === 2) { // Control format
      opcode = (instruction >> 27) & 0x7;
      rn = (instruction >> 22) & 0x1F;
      offset = instruction & 0x3FFFFF;
      // Sign extend offset if needed
      if (offset & 0x200000) {
        offset |= 0xFFC00000;
      }
    }
    
    console.log(`Decode: type=${type}, opcode=${opcode}, rn=${rn}, rm=${rm}, rd=${rd}, imm=${imm}, offset=${offset}`);
    
    const decodedInst = {
      type,
      opcode,
      rn, rm, rd,
      imm, offset,
      instruction
    };
    
    this.stages.execute.instruction = decodedInst;
    this.stages.decode.instruction = null;
  }

  processExecuteStage() {
    if (!this.stages.execute.instruction) return;
    
    const inst = this.stages.execute.instruction;
    let result = 0;
    let needsMemory = false;
    
    // Default the destination register to the specified rd
    let destReg = inst.rd;
    
    console.log(`Execute: Processing instruction type=${inst.type}, opcode=${inst.opcode}`);
    
    switch (inst.type) {
      case 0: // ALU operations
        switch (inst.opcode) {
          case this.OPCODES.ADD:
            result = this.registers[inst.rn] + this.registers[inst.rm];
            console.log(`Execute: ADD X${inst.rd} = X${inst.rn}(${this.registers[inst.rn]}) + X${inst.rm}(${this.registers[inst.rm]}) = ${result}`);
            break;
            
          case this.OPCODES.ADDI:
            result = this.registers[inst.rn] + inst.imm;
            console.log(`Execute: ADDI X${inst.rd} = X${inst.rn}(${this.registers[inst.rn]}) + ${inst.imm} = ${result}`);
            break;
            
          case this.OPCODES.SUB:
            result = this.registers[inst.rn] - this.registers[inst.rm];
            console.log(`Execute: SUB X${inst.rd} = X${inst.rn}(${this.registers[inst.rn]}) - X${inst.rm}(${this.registers[inst.rm]}) = ${result}`);
            break;
            
          case this.OPCODES.SUBI:
            result = this.registers[inst.rn] - inst.imm;
            console.log(`Execute: SUBI X${inst.rd} = X${inst.rn}(${this.registers[inst.rn]}) - ${inst.imm} = ${result}`);
            break;
            
          case this.OPCODES.MOV:
            result = this.registers[inst.rn];
            console.log(`Execute: MOV X${inst.rd} = X${inst.rn}(${this.registers[inst.rn]})`);
            break;
            
          case this.OPCODES.MOVI:
            // FIX: For MOVI instructions from test-binary-generator.js format
            result = inst.imm; // The immediate is correctly extracted in decode stage
            console.log(`Execute: MOVI X${inst.rm} = ${inst.imm}`); // Note: For MOVI, the register is in rm field
            destReg = inst.rm; // FIX: Use rm as destination register for MOVI
            break;
            
          default:
            console.log(`Execute: Unknown ALU opcode ${inst.opcode}`);
            destReg = -1; // No register update for unknown instructions
        }
        break;
        
      case 1: // Memory operations
        switch (inst.opcode) {
          case this.OPCODES.LOAD:
            // Calculate memory address
            result = this.registers[inst.rn] + inst.offset;
            needsMemory = true;
            destReg = inst.rd;
            console.log(`Execute: LOAD X${inst.rd} from address X${inst.rn}(${this.registers[inst.rn]}) + ${inst.offset} = ${result}`);
            break;
            
          case this.OPCODES.STR:
            // Calculate memory address for store
            result = this.registers[inst.rn] + inst.offset;
            needsMemory = true;
            inst.value = this.registers[inst.rd]; // Value to store
            destReg = -1; // No register update for stores
            console.log(`Execute: STORE X${inst.rd}(${this.registers[inst.rd]}) to address X${inst.rn}(${this.registers[inst.rn]}) + ${inst.offset} = ${result}`);
            break;
            
          default:
            console.log(`Execute: Unknown memory opcode ${inst.opcode}`);
            destReg = -1;
        }
        break;
        
      case 2: // Control flow
        switch (inst.opcode) {
          case this.OPCODES.BEQ:
            if (this.registers[inst.rn] === 0) {
              this.pc += inst.offset;
              this.branchTaken = true;
              console.log(`Execute: BEQ taken, new PC = ${this.pc}`);
            } else {
              console.log(`Execute: BEQ not taken`);
            }
            destReg = -1; // No register update for branches
            break;
            
          case this.OPCODES.BLT:
            if (this.registers[inst.rn] < 0) {
              this.pc += inst.offset;
              this.branchTaken = true;
              console.log(`Execute: BLT taken, new PC = ${this.pc}`);
            } else {
              console.log(`Execute: BLT not taken`);
            }
            destReg = -1; // No register update for branches
            break;
            
          case this.OPCODES.JMP:
            this.pc = this.registers[inst.rn];
            this.branchTaken = true;
            console.log(`Execute: JMP to X${inst.rn}(${this.registers[inst.rn]})`);
            destReg = -1; // No register update for jumps
            break;
            
          default:
            console.log(`Execute: Unknown control opcode ${inst.opcode}`);
            destReg = -1;
        }
        break;
        
      default:
        console.log(`Execute: Unknown instruction type ${inst.type}`);
        destReg = -1;
    }

    // Set the results for next stages
    inst.result = result;
    inst.needsMemory = needsMemory;
    inst.destReg = destReg; // Store the destination register
    
    this.stages.memory.instruction = inst;
    this.stages.execute.instruction = null;
  }

  processMemoryStage() {
    if (!this.stages.memory.instruction) return;
    
    const inst = this.stages.memory.instruction;
    
    if (inst.needsMemory) {
      if (inst.type === 1) {
        if (inst.opcode === this.OPCODES.LOAD) {
          // For load, read from memory
          const memAddr = inst.result;
          const lineIndex = Math.floor(memAddr / 16);
          const offset = memAddr % 16;
          
          if (lineIndex >= 0 && lineIndex < this.memorySystem.memory.data.length) {
            inst.result = this.memorySystem.memory.data[lineIndex][offset];
            console.log(`Memory: LOAD from address ${memAddr} = ${inst.result}`);
          } else {
            console.log(`Memory: Invalid load address ${memAddr}`);
            inst.result = 0;
          }
        } else if (inst.opcode === this.OPCODES.STR) {
          // For store, write to memory
          const memAddr = inst.result;
          const lineIndex = Math.floor(memAddr / 16);
          const offset = memAddr % 16;
          
          if (lineIndex >= 0 && lineIndex < this.memorySystem.memory.data.length) {
            this.memorySystem.memory.data[lineIndex][offset] = inst.value;
            console.log(`Memory: STORE to address ${memAddr} = ${inst.value}`);
          } else {
            console.log(`Memory: Invalid store address ${memAddr}`);
          }
        }
      }
    }
    
    this.stages.writeback.instruction = inst;
    this.stages.memory.instruction = null;
  }

  processWritebackStage() {
    if (!this.stages.writeback.instruction) return;
    
    const inst = this.stages.writeback.instruction;
    
    // Update register if there's a valid destination register
    // Skip register 0 (hardwired to 0 in RISC architectures)
    if (inst.destReg > 0 && inst.destReg < 32) {
      this.registers[inst.destReg] = inst.result;
      console.log(`Writeback: X${inst.destReg} = ${inst.result}`);
    } else {
      console.log(`Writeback: No register update needed`);
    }
    
    // Increment instruction count
    this.instructions++;
    console.log(`Instruction completed, total: ${this.instructions}`);
    
    // Clear writeback stage
    this.stages.writeback.instruction = null;
  }

  reset() {
    this.registers = new Array(32).fill(0);
    this.pc = 0;
    this.stages = {
      fetch: { instruction: null },
      decode: { instruction: null },
      execute: { instruction: null },
      memory: { instruction: null },
      writeback: { instruction: null }
    };
    this.halted = false;
    this.cycles = 0;
    this.instructions = 0;
    this.stalls = 0;
    this.branchTaken = false;
  }

  getRegisterState() {
    return [...this.registers];
  }

  getPipelineState() {
    const state = {};
    for (const [stageName, stageData] of Object.entries(this.stages)) {
      state[stageName] = { instruction: stageData.instruction };
    }
    return state;
  }

  getPerformanceStats() {
    return {
      cycles: this.cycles,
      instructions: this.instructions,
      stalls: this.stalls,
      ipc: this.instructions / Math.max(1, this.cycles) || 0,
      stallRate: this.stalls / Math.max(1, this.cycles) || 0
    };
  }
}