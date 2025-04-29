// test-binary-generator.js
const fs = require('fs');

// Create a buffer for our instructions
const buffer = Buffer.alloc(16); // 4 instructions * 4 bytes each

// MOVI X1, 10
// Original: (0b00 << 30) | (0b11000 << 25) | (0 << 20) | (1 << 15) | 10
// Ensure this creates: 0x0600100a which is what the CPU expects
const instr1 = (0b00 << 30) | (0b00011 << 25) | (0 << 20) | (0 << 15) | (1 << 10) | 10;
buffer.writeUInt32BE(instr1, 0);

// MOVI X2, 5
// Original: (0b00 << 30) | (0b11000 << 25) | (0 << 20) | (2 << 15) | 5
// Ensure this creates: 0x06002005
const instr2 = (0b00 << 30) | (0b00011 << 25) | (0 << 20) | (0 << 15) | (2 << 10) | 5;
buffer.writeUInt32BE(instr2, 4);

// ADD X3, X1, X2
// Original: (0b00 << 30) | (0b00000 << 25) | (1 << 20) | (2 << 15) | (3 << 10)
// Ensure this creates: 0x00140c00
const instr3 = (0b00 << 30) | (0b00000 << 25) | (1 << 20) | (2 << 15) | (3 << 10);
buffer.writeUInt32BE(instr3, 8);

// SUB X4, X1, X2
// Original: (0b00 << 30) | (0b00100 << 25) | (1 << 20) | (2 << 15) | (4 << 10)
// Ensure this creates: 0x01141000
const instr4 = (0b00 << 30) | (0b00100 << 25) | (1 << 20) | (2 << 15) | (4 << 10);
buffer.writeUInt32BE(instr4, 12);

// Write to file
fs.writeFileSync('test_program.bin', buffer);

console.log('Binary file created with 4 instructions:');
console.log(`Instruction 1 (MOVI X1, 10): 0x${instr1.toString(16).padStart(8, '0')}`);
console.log(`Instruction 2 (MOVI X2, 5): 0x${instr2.toString(16).padStart(8, '0')}`);
console.log(`Instruction 3 (ADD X3, X1, X2): 0x${instr3.toString(16).padStart(8, '0')}`);
console.log(`Instruction 4 (SUB X4, X1, X2): 0x${instr4.toString(16).padStart(8, '0')}`);