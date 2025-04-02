import readline from 'readline';
import { pipeline } from 'stream';
import { Cache, Memory, MemorySystem } from './cache-simulator.mjs';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


class Pipeline {
    constructor() {

        this.stages = {
            fetch: null,
            decode: null,
            execute: null,
            memory: null,
            writeBack: null
        };
        this.clockCycle = 0;
        this.isStall = false;
    }

    getInstruction(instruction) {
        this.stages.fetch = instruction;
    }



    updatePipeline(){ 

        this.stages.writeBack = this.stages.memory; 
        this.stages.memory = this.stages.execute;
        this.stages.execute = this.stages.decode;
        this.stages.decode = this.stages.fetch;
        this.stages.fetch = null;

    }

    displayPipeline() {
        console.log(`This is the fetch stage: ${this.stages.fetch}`);
        console.log(`This is the decode stage: ${this.stages.decode}`);
        console.log(`This is the execute stage: ${this.stages.execute}`);
        console.log(`This is the memory stage: ${this.stages.memory}`);
        console.log(`This is the write back stage: ${this.stages.writeBack}`);
        console.log(`This is CLOCK CYCLE: ${this.clockCycle}`);
        console.log(`\n`);
        //TODO:

    }
}

//Create a register class; 
//We going to have 32 general purpose registers. 
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

    //Would it make more sense to have an 32 sized array w/
    constructor() {
        this.GenRegisters = Array(32).fill(0); 
    }

    read(regNum) {
        if(regNum < 0 || regNum > 31) { throw new Error('Invalid Register Number'); }
        return this.GenRegisters[regNum]; 
    }

    write(regNum, newValue) {
        if(regNum < 0 || regNum > 31) { throw new Error('Invalid Register Number'); }
        this.GenRegisters[regNum] = newValue; 
    }
}

const registers = new GeneralRegisters();
const instructionReg = new Register();
const PC = new Register(-1); 
const instructionQueue = []; 
const p = new Pipeline();
global.memorySystem = new MemorySystem();


function askForCommand() {
    rl.question("Input Instruction: ", (instruction) => {
        if (instruction.toLowerCase() === 'e') {
            console.log("Exiting program...");
            rl.close();
            return;
        }

        //We should add a check if the instruction is valid...

        //First we increment the PC
        instruction = instruction.toUpperCase(); 
        PC.write(PC.read() + 1);
        console.log(PC.read());
        //Afterwards we add the instruction to an instruction Queue:
        instructionQueue.push(instruction);
        //Then if allowed, pop off the first element ant put it into the instruction register

        //we need to check if there is a stall first before popping off the queue. 
        const i = instructionQueue.shift()
        instructionReg.write(i); //we get the first element. 

        p.updatePipeline(); //clears previous instruction
        p.getInstruction(i);
   
        const inst = String(i).split(" ")[0];
        p.displayPipeline();


        //We then input the instruction in the instruction register into the decode function
        decode(instructionReg.read()); 



        askForCommand();
    });
}

askForCommand();


//The decode function which is a giant switch statement determiens what kind of instruction it is
//depending on the case, we get to the coresponding function for said insturction
//the instruction is executed in the function and result is saved into a register.
function decode(instruction) {

    // we need to parse the instruction: 
    console.log(instruction);

    let listOfInst = instruction.split(" "); 
    //Format is Rd, Rn, Rm
    switch(listOfInst[0]){
        case 'ADD':
            //Insert ADD function
            p.updatePipeline();
            p.displayPipeline(); 

            ADD(listOfInst[1], listOfInst[2], listOfInst[3]); 
            break; 

        case 'ADDI':

            p.updatePipeline();
            p.displayPipeline(); 

            ADDI(listOfInst[1], listOfInst[2], listOfInst[3]); 
            break;
            
        case 'SUB':
            p.updatePipeline();
            p.displayPipeline(); 

            SUB(listOfInst[1], listOfInst[2], listOfInst[3]); 
            break;
        
        case 'SUBI':
            p.updatePipeline();
            p.displayPipeline(); 

            SUBI(listOfInst[1], listOfInst[2], listOfInst[3]); 
            break; 
        
        case 'LOAD': 
            p.updatePipeline();
            p.displayPipeline();

            LOAD(listOfInst[1], listOfInst[2], listOfInst[3]);
            break; 

        case 'STR':
            p.updatePipeline();
            p.displayPipeline();

            STR(listOfInst[1], listOfInst[2], listOfInst[3]);
            break; 

        case 'MOV':
            p.updatePipeline();
            p.displayPipeline();

            MOV(listOfInst[1], listOfInst[2]);
            break; 
        
        case "MOVI": 
            p.updatePipeline();
            p.displayPipeline();

            MOVI(listOfInst[1], listOfInst[2]); //Takes in a Rd, and an immediate as parameters. 
            break;
    }
    p.clockCycle++;
    console.log(`The Clock Cycle is now at: ${p.clockCycle}`);
}

function ADD(Rd, Rn, Rm) {
    console.log(`This is the OPCODE for ADD: 00000`)
    p.updatePipeline();
    p.displayPipeline();
    //there's probaby a less redundant way of doing this,, im too lazy rn 
    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);
    const RmNum = Rm.slice(1);

    //Using the parameters, we call the specific registers. 
    const value = Number(registers.read(RnNum)) + Number(registers.read(RmNum));
    
    p.updatePipeline();
    p.displayPipeline();

    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}

function ADDI(Rd, Rn, immediate) {
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);

    const value = Number(registers.read(RnNum)) + Number(immediate);

    p.updatePipeline();
    p.displayPipeline();

    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);

}

function SUB(Rd, Rn, Rm) {

    p.updatePipeline();
    p.displayPipeline();
    //there's probaby a less redundant way of doing this,, im too lazy rn 
    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);
    const RmNum = Rm.slice(1);

    //Using the parameters, we call the specific registers. 
    const value = Number(registers.read(RnNum)) - Number(registers.read(RmNum));
    
    p.updatePipeline();
    p.displayPipeline();
    
    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);

}

function SUBI(Rd, Rn, immediate) {
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);

    const value = Number(registers.read(RnNum)) - Number(immediate);

    p.updatePipeline();
    p.displayPipeline();

    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}

//This function is wrong,, im just using it to test
function LOAD(Rd, Rn, offset) {
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);

    const memoryAddress = Number(registers.read(RnNum)) + Number(offset);

    if (!global.memorySystem) {
        global.memorySystem = new MemorySystem();
    }
    
    p.updatePipeline();
    p.displayPipeline();
    
    // Request value from memory system
    // The 'memory' parameter indicates this request is from the memory stage
    const result = global.memorySystem.read(memoryAddress, 'memory');
    
    // If the result is not immediately available
    if (result.status === "wait") {
        console.log(`Memory access in progress for address ${memoryAddress}`);
        
        // Process cycles until complete
        let memResult = result;
        while (memResult.status === "wait") {
            global.memorySystem.processCycle();
            // Check if there are still pending requests
            if (global.memorySystem.pendingRequests.has('memory')) {
                memResult = { status: "wait" };
            } else {
                // No more pending requests means it's done
                // Get the value directly from cache or memory
                const cacheResult = global.memorySystem.cache.read(memoryAddress);
                if (cacheResult.hit) {
                    memResult = { status: "done", data: cacheResult.data };
                } else {
                    // Fallback to reading from memory directly
                    const { lineIndex, offset } = global.memorySystem.memory.getLineAndOffset(memoryAddress);
                    memResult = { status: "done", data: global.memorySystem.memory.data[lineIndex][offset] };
                }
            }
            console.log(`Memory access cycle: ${memResult.status}`);
        }
        
        // Once memory access is complete
        registers.write(RdNum, memResult.data);
        console.log(`Loaded value ${memResult.data} from address ${memoryAddress} to register ${Rd}`);
    } else {
        // Cache hit with no delay
        registers.write(RdNum, result.data);
        console.log(`Loaded value ${result.data} from address ${memoryAddress} to register ${Rd}`);
    }
    
    p.updatePipeline();
    p.displayPipeline();
}

function STR(Rd, Rn, offset) {
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);

    // Calculate the memory address
    const memoryAddress = Number(registers.read(RnNum)) + Number(offset);
    // Get the value to store from Rd
    const valueToStore = registers.read(RdNum);
    
    p.updatePipeline();
    p.displayPipeline();
    
    // Write value to memory system
    const result = global.memorySystem.write(memoryAddress, valueToStore, 'memory');
    
    // If the result is not immediately available (delay)
    if (result.status === "wait") {
        console.log(`Memory write in progress for address ${memoryAddress}`);
        // Process cycles until the request completes
        let memResult = result;
        while (memResult.status === "wait") {
            global.memorySystem.processCycle();
            memResult = global.memorySystem.processWrite(memoryAddress, valueToStore, 'memory');
            console.log(`Memory write cycle: ${memResult.status}`);
        }
        
        console.log(`Stored value ${valueToStore} to address ${memoryAddress} from register ${Rd}`);
    } else {
        console.log(`Stored value ${valueToStore} to address ${memoryAddress} from register ${Rd}`);
    }
    
    p.updatePipeline();
    p.displayPipeline();

}

//TODO
//Rd is the destination register
function MOV(Rd, Rn){
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);
    const RnNum = Rn.slice(1);
    const value = registers.read(RnNum); // get the value in Register Rn

    p.updatePipeline();
    p.displayPipeline();

    registers.write(RdNum, value); //Update the value in Rd w new value 
    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}

function MOVI(Rd, immediate) {
    p.updatePipeline();
    p.displayPipeline();

    const RdNum = Rd.slice(1);

    p.updatePipeline();
    p.displayPipeline();

    const value = immediate; 

    p.updatePipeline();
    p.displayPipeline();

    registers.write(RdNum, value);
    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}


/*

--> TODO: IMPORTANT: 
--> FIX LOAD...!!!
-->

--> fetch to fetch again is one clock cycle.
For instance, we start the clock cycle at 0 
    --> We go from F D E M W, and then loop back to F again, this increases the clock cycle by one. 


Stage ID
DO CLOCK CYCLE COUNTER
Do ADD, SUB, LOAD, STR, 
IMPLEMENT STALL


TODO: 
Probably have a really huge switch statement in the command line driver
    --> Parses the instruction input 


NOTES:
Going from Write back --> fetch --> Write back is one clock cycle 

--> Program registers. 
    ---> Just store values 

Fetch:
Getting the user input 


Decode: 
Switch cases: 
Giant switch statement
dpeneding on the input, goes to a specific function like add, Divide, shit like that 

Execute:
--> The function call,, the actual computation gets done in this stage. 
    --> For instance "add" instruction just adds the two registers 
    --> saves values to registers in this stage
    --> All arithmetic things 

Memory
--> Only deals w/ loads and stores 
--> In this stage cache and Memory will be interacted with/ 

Writeback: 

--> The output of the execute gets added to the destination register. 


Instead of keeping the switch statement in the command line driver, we make it its own "Decode" function
We fetch the user input instruction and store it in a program counter. 

Do we need an instruction queue? Idk lol 

We dont need an accumulator 

We need a program counter? and a Instruction register? 
*/
