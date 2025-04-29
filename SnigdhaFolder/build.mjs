// build.mjs
import { readFile, writeFile } from 'fs/promises';
import { findLabels, assemble } from './assembler.mjs';

async function build() {
    try {
        const source = await readFile('loop_test.s', 'utf8');
        const lines = source.split('\n');
        
        console.log(`Loaded source file with ${lines.length} lines`);
        
        // First pass: collect labels
        const labels = findLabels(lines);
        console.log(`Found labels: ${Object.keys(labels).join(', ')}`);
        
        // Second pass: generate machine code
        const program = assemble(lines, labels);
        console.log(`Assembled ${program.length} instructions`);
        
        // Create binary output
        const buffer = Buffer.alloc(program.length * 4);
        for (let i = 0; i < program.length; i++) {
            buffer.writeUInt32BE(program[i], i * 4);
            console.log(`Instruction ${i}: 0x${program[i].toString(16).padStart(8, '0')}`);
        }
        
        // Write to file
        await writeFile('program.bin', buffer);
        console.log('Assembled program to program.bin');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();