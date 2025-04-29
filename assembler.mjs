// assembler.mjs

import { writeFile } from 'fs/promises';

// Instruction encoding lookup
const OPCODES = {
    'ADD': 0b00000,
    'ADDS': 0b00001,
    'ADDI': 0b00010,
    'ADDIS': 0b00011,
    'SUB': 0b00100,
    'SUBS': 0b00101,
    'SUBI': 0b00110,
    'SUBIS': 0b00111,
    'MUL': 0b01000,
    'MULI': 0b01001,
    'DIV': 0b01010,
    'DIVI': 0b01011,
    'AND': 0b01100,
    'ANDI': 0b01101,
    'OR': 0b01110,
    'ORI': 0b01111,
    'XOR': 0b10000,
    'XORI': 0b10001,
    'SHL': 0b10010,
    'SHR': 0b10011,
    'CMP': 0b10100,
    'MOD': 0b10101,
    'MODI': 0b10110,
    'MOV': 0b10111,
    'MOVI': 0b11000,
    'LOAD': 0b00,
    'STR': 0b01,
    'JMP': 0b000,
    'BEQ': 0b001,
    'BLT': 0b010,
    'CAL': 0b100,
    'FLUSH': 0b101
};

// Instruction type categorization
const TYPE_R = ['ADD', 'ADDS', 'SUB', 'SUBS', 'MUL', 'DIV', 'AND', 'OR', 'XOR', 'CMP', 'MOD'];
const TYPE_RI = ['ADDI', 'ADDIS', 'SUBI', 'SUBIS', 'MULI', 'DIVI', 'ANDI', 'ORI', 'XORI', 'MOVI', 'MODI'];
const TYPE_SHIFT = ['SHL', 'SHR'];
const TYPE_MOV = ['MOV'];
const TYPE_LOADSTORE = ['LOAD', 'STR'];
const TYPE_CONTROL = ['JMP', 'BEQ', 'BLT', 'CAL', 'FLUSH'];
const TYPE_MISC = ['RET'];

// Helper: extract register number
function regNum(rstr) {
    if (!rstr) {
        throw new Error("Assembler error: Missing register name.");
    }
    if (rstr.startsWith('X') || rstr.startsWith('R')) {
        return parseInt(rstr.slice(1));
    }
    return parseInt(rstr);
}

// Helper: sign-extend
function encodeSigned(val, bits) {
    if (val < 0) {
        val = (1 << bits) + val;
    }
    return val & ((1 << bits) - 1);
}

// First Pass: find label addresses
export function findLabels(lines) {
    const labels = {};
    let pc = 0;
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue; // Skip empty lines and comments
        }
        
        if (trimmedLine.includes(':')) {
            const label = trimmedLine.split(':')[0].trim();
            labels[label] = pc;
            // If there's an instruction after the label on the same line, increment PC
            if (trimmedLine.split(':')[1].trim()) {
                pc++;
            }
        } else {
            pc++;
        }
    }
    return labels;
}

// Second Pass: assemble into machine code
export function assemble(lines, labels) {
    const program = [];
    let pc = 0;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].split('#')[0].trim();
        if (!line) continue;
        
        // Handle labels
        if (line.includes(':')) {
            const parts = line.split(':');
            line = parts[1].trim();
            if (!line) continue; // Skip if only a label on this line
        }
        
        const parts = line.replace(/,/g, '').split(/\s+/);
        const mnemonic = parts[0].toUpperCase();
        
        let word = 0;
        
        if (TYPE_R.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b00;
            const Rn = regNum(parts[2]);
            const Rm = regNum(parts[3]);
            const Rd = regNum(parts[1]);
            word = (typeBits << 30) | (opcode << 25) | (Rn << 20) | (Rm << 15) | (Rd << 10);
        }
        else if (TYPE_RI.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b00;
            let Rn = 0;
            
            if (parts.length >= 3) {
                // Format: MOVI Rd, #imm
                if (mnemonic === 'MOVI') {
                    Rn = 0;
                } else {
                    // Format: ADDI Rd, Rn, #imm
                    Rn = regNum(parts[2]);
                }
            }
            
            const Rd = regNum(parts[1]);
            const immStr = parts[parts.length - 1];
            const imm = parseInt(immStr.startsWith('#') ? immStr.slice(1) : immStr, 10);
            
            word = (typeBits << 30) | (opcode << 25) | (Rn << 20) | (Rd << 15) | (imm & 0x7FFF);
        }
        else if (TYPE_SHIFT.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b00;
            const Acc = regNum(parts[1]);
            const imm = encodeSigned(parseInt(parts[2], 10), 5);
            word = (typeBits << 30) | (opcode << 25) | (Acc << 20) | (imm << 15);
        }
        else if (TYPE_MOV.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b00;
            const Rn = regNum(parts[2]);
            const Rd = regNum(parts[1]);
            word = (typeBits << 30) | (opcode << 25) | (Rn << 20) | (Rd << 15);
        }
        else if (TYPE_LOADSTORE.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b01;
            const Rn = regNum(parts[2]);
            const Rd = regNum(parts[1]);
            const offset = encodeSigned(parseInt(parts[3], 10), 18);
            word = (typeBits << 30) | (opcode << 28) | (Rn << 23) | (Rd << 18) | offset;
        }
        else if (TYPE_CONTROL.includes(mnemonic)) {
            const opcode = OPCODES[mnemonic];
            const typeBits = 0b10;
            if (mnemonic === 'JMP' || mnemonic === 'FLUSH') {
                const Rn = regNum(parts[1]);
                word = (typeBits << 30) | (opcode << 27) | (Rn << 22);
            }
            else if (mnemonic === 'BEQ') {
                const label = parts[1];
                const offset = encodeSigned(labels[label] - (pc + 1), 27);
                word = (typeBits << 30) | (opcode << 27) | offset;
            }
            else if (mnemonic === 'BLT') {
                const Rn = regNum(parts[1]);
                const offset = encodeSigned(labels[parts[2]] - (pc + 1), 22);
                word = (typeBits << 30) | (opcode << 27) | (Rn << 22) | offset;
            }
            else if (mnemonic === 'CAL') {
                const Rn = regNum(parts[1]);
                const offset = encodeSigned(parseInt(parts[2], 10), 22);
                word = (typeBits << 30) | (opcode << 27) | (Rn << 22) | offset;
            }
        }
        else if (TYPE_MISC.includes(mnemonic)) {
            const typeBits = 0b10; // Control type
            const opcode = 0b011;  // Let's say 011 = RET (you can assign the real value you want)
            word = (typeBits << 30) | (opcode << 27);
        }
        else {
            throw new Error(`Unknown instruction: ${mnemonic} at line ${i+1}`);
        }

        program.push(word >>> 0); // Make sure it's 32-bit unsigned
        pc++;
    }
    return program;
}

// Save program to a binary file
export async function saveBinary(program, filename) {
    const buffer = Buffer.alloc(program.length * 4);
    program.forEach((word, i) => {
        buffer.writeUInt32BE(word, i * 4);
    });
    await writeFile(filename, buffer);
    console.log(`Saved ${program.length} instructions to ${filename}`);
}

// Main function
export async function assembleFile(inputFile, outputFile) {
    const content = await import('fs/promises').then(fs => fs.readFile(inputFile, 'utf8'));
    const lines = content.split('\n');

    const labels = findLabels(lines);
    const program = assemble(lines, labels);
    await saveBinary(program, outputFile);
}

// Export a function to help with testing
export function encodeInstruction(mnemonic, ...args) {
    const line = `${mnemonic} ${args.join(', ')}`;
    const mockLabels = {}; // Empty labels for simple instruction test
    return assemble([line], mockLabels)[0];
}