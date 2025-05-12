// assembler.mjs

// Instruction Type Prefixes (first 2 bits)
const TYPE_ARITHMETIC = 0b00;
const TYPE_MEMORY     = 0b01;
const TYPE_CONTROL    = 0b10;
// TYPE_SYSTEM (e.g., for FLUSH if it were separate, but it's under CONTROL based on prompt)

// Helper to parse register string "R5" to number 5
function parseReg(regStr) {
    if (!regStr || !regStr.toUpperCase().startsWith('R')) {
        throw new Error(`Invalid register format: ${regStr}`);
    }
    const num = parseInt(regStr.slice(1));
    if (isNaN(num) || num < 0 || num > 31) {
        throw new Error(`Invalid register number: ${regStr}`);
    }
    return num;
}

// Helper to parse immediate string "#123" or "123" to number
function parseImm(immStr, allowNegative = true) {
    const num = parseInt(immStr.startsWith('#') ? immStr.slice(1) : immStr);
    if (isNaN(num)) {
        throw new Error(`Invalid immediate value: ${immStr}`);
    }
    return num;
}

// Helper to convert a number to a binary string of a specific bit length
// Handles 2's complement for negative numbers if bitLength is specified
function toBinary(value, bitLength) {
    let binStr;
    if (value >= 0) {
        binStr = value.toString(2);
    } else {
        // For negative numbers, calculate 2's complement representation
        binStr = (Math.pow(2, bitLength) + value).toString(2);
    }
    return binStr.padStart(bitLength, '0').slice(-bitLength);
}


export function assembleInstruction(asmString) {
    if (!asmString || asmString.trim() === "" || asmString.trim().startsWith("//") || asmString.trim().startsWith("#")) {
        return null; // Skip empty or comment lines
    }

    const parts = asmString.toUpperCase().split(/[\s,()\[\]#]+/).filter(p => p && p.trim() !== "");
    const mnemonic = parts[0];
    let type, opCodeVal, rd, rn, rm, immediate, offset;
    let binaryString = "";

    try {
        switch (mnemonic) {
            // --- Type 00: Arithmetic ---
            case 'ADD': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00000;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'ADDS': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00001;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'ADDI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00010;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'ADDIS': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00011;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'SUB': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00100;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'SUBS': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00101;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'SUBI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00110;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'SUBIS': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b00111;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'MUL': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01000;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'MULI': // Type(2) OPCode(5) Rn(5) Rd(5) Imm(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01001;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'DIV': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01010;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'DIVI': // Type(2) OPCode(5) Rn(5) Rd(5) Imm(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01011;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'AND': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01100;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'ANDI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01101;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3], false); // Logical, usually positive immediate
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'OR': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10) (ORR in ARM)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01110;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'ORI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b01111;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3], false);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'XOR': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10) (EOR in ARM)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10000;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'XORI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10001;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3], false);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'SHL': // Type(2) OPCode(5) Acc(Rd)(5) Imm(5) Unused(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10010;
                rd = parseReg(parts[1]); // Acc is Rd
                immediate = parseImm(parts[2], false); // Shift amount
                // Rn and Rm are not used in this format directly in fields, but SHL Rd, Rn, #imm is common.
                // Assuming format Acc(Rd)(5) Imm(5) means Rn and Rm fields are zero or repurposed.
                // Let's say Rd is the acc, and Rn holds the value to be shifted if not specified otherwise.
                // Given format: Acc(5) Imm(5). This is odd. Usually Rd, Rn, #Shift_amount.
                // If Acc means Rd (destination and source operand), then 2nd operand for shift amount.
                // "Logical shifts the accumulator left by the amount specified by the immediate."
                // This could mean Acc is an implicit register or one specified. parts[1] is Acc (Rd), parts[2] is Imm.
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rd, 5)}${toBinary(immediate, 5)}${toBinary(0, 15)}`; // Rn, Rm effectively unused/zero
                break;
            case 'SHR': // Type(2) OPCode(5) Acc(Rd)(5) Imm(5) Unused(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10011;
                rd = parseReg(parts[1]); // Acc is Rd
                immediate = parseImm(parts[2], false); // Shift amount
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rd, 5)}${toBinary(immediate, 5)}${toBinary(0, 15)}`;
                break;
            case 'CMP': // Type(2) OPCode(5) Rn(5) Rm(5) Unused(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10100;
                rn = parseReg(parts[1]); rm = parseReg(parts[2]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(0, 15)}`; // Rd is not used for storing result
                break;
            case 'MOD': // Type(2) OPCode(5) Rn(5) Rm(5) Rd(5) Unused(10)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10101;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); rm = parseReg(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rm, 5)}${toBinary(rd, 5)}${toBinary(0, 10)}`;
                break;
            case 'MODI': // Type(2) OPCode(5) Rn(5) Rd(5) Immediate(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10110;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); immediate = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(immediate, 15)}`;
                break;
            case 'MOV': // Type(2) OPCode(5) Rn(5) Rd(5) Unused(15)
                type = TYPE_ARITHMETIC; opCodeVal = 0b10111;
                rd = parseReg(parts[1]); rn = parseReg(parts[2]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(0, 15)}`; // Rm is not used
                break;
            case 'MOVI': // Type(2) OPCode(5) Rd(5) Immediate(20)
                type = TYPE_ARITHMETIC; opCodeVal = 0b11000;
                rd = parseReg(parts[1]); immediate = parseImm(parts[2]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 5)}${toBinary(rd, 5)}${toBinary(immediate, 20)}`; // Rn is not used
                break;

            // --- Type 01: Memory Access ---
            case 'LOAD': // Type(2) OPCode(2) Rn(5) Rd(5) Offset(18)
                type = TYPE_MEMORY; opCodeVal = 0b00; // Memory OpCode is 2 bits
                rd = parseReg(parts[1]); rn = parseReg(parts[2]); offset = parseImm(parts[3]);
                // For memory opcodes, the 5-bit general opcode field is not used, instead a 2-bit specific memory opcode.
                // The prompt implies Type(2) OpCode(2) ... so the next 3 bits of general opcode field are unused.
                // Let's combine Type and MemOpCode for clarity in binary string.
                // Type(2)=01, MemOpCode(2)=00. The remaining bits for "general opcode field" would be 000.
                // Total bits: Type(2) + ActualMemOp(2) + Rn(5) + Rd(5) + Offset(18) = 32.
                // The prompt's table: "Type 01: Memory Access: OPCODE: 00 Mnemonic: LOAD"
                // This means the 2 bits *after* the Type field are the opcode for memory.
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 2)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(offset, 18)}${toBinary(0,5)}`; // The 5 'unused' bits are to make it align with other formats total 32 bit field description if we assume type+opcode always 7 bits
                // Correcting based on total bits: Type(2) MemOpCode(2) Rn(5) Rd(5) Offset(18) = 2+2+5+5+18 = 32. No extra unused needed here.
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 2)}${toBinary(rn, 5)}${toBinary(rd, 5)}${toBinary(offset, 18)}`;
                break;
            case 'STR': // Type(2) OPCode(2) Rn(5) Rd(5) Offset(18) (Rd is source for STR)
                type = TYPE_MEMORY; opCodeVal = 0b01; // Memory OpCode is 2 bits
                let srcRegStr = parseReg(parts[1]); // Rd field stores source register for STR
                rn = parseReg(parts[2]); offset = parseImm(parts[3]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 2)}${toBinary(rn, 5)}${toBinary(srcRegStr, 5)}${toBinary(offset, 18)}`;
                break;

            // --- Type 10: Control Flow ---
            case 'JMP': // Type(2) OPCode(3) Rn(5) Unused(22)
                type = TYPE_CONTROL; opCodeVal = 0b000; // Control OpCode is 3 bits
                rn = parseReg(parts[1]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 3)}${toBinary(rn, 5)}${toBinary(0, 22)}`;
                break;
            case 'BEQ': // Type(2) OPCode(3) Offset(27)
                type = TYPE_CONTROL; opCodeVal = 0b001;
                offset = parseImm(parts[1]); // BEQ TARGET_OFFSET (PC-relative)
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 3)}${toBinary(offset, 27)}`;
                break;
            case 'BLT': // Type(2) OPCode(3) Rn(5) Offset(22)
                type = TYPE_CONTROL; opCodeVal = 0b010;
                // As per thought process: if (flags) PC = Reg[Rn] + Offset
                rn = parseReg(parts[1]); offset = parseImm(parts[2]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 3)}${toBinary(rn, 5)}${toBinary(offset, 22)}`;
                break;
            case 'CAL': // Type(2) OPCode(3) Rn(5) Offset(22)
                type = TYPE_CONTROL; opCodeVal = 0b100;
                // LR = PC+4; PC = Reg[Rn] + Offset
                rn = parseReg(parts[1]); offset = parseImm(parts[2]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 3)}${toBinary(rn, 5)}${toBinary(offset, 22)}`;
                break;
            case 'FLUSH': // Type(2) OPCode(3) Rn(5) Unused(22)
                type = TYPE_CONTROL; opCodeVal = 0b101;
                // Flush cache line containing address in Reg[Rn]
                rn = parseReg(parts[1]);
                binaryString = `${toBinary(type, 2)}${toBinary(opCodeVal, 3)}${toBinary(rn, 5)}${toBinary(0, 22)}`;
                break;

            default:
                throw new Error(`Unknown mnemonic: ${mnemonic}`);
        }
    } catch (e) {
        console.error(`Assembler Error for "${asmString}": ${e.message}`);
        throw e; // Re-throw to be caught by loader
    }


    if (binaryString.length !== 32) {
        throw new Error(`Assembled instruction "${asmString}" resulted in binary of length ${binaryString.length}, expected 32.`);
    }
    return parseInt(binaryString, 2); // Return as a 32-bit integer
}