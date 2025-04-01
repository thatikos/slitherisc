const readline = require('readline');
const { pipeline } = require('stream');

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
        this.isMemoryInstruction = false; 

    }

    getInstruction(instruction) {
        this.stages.fetch = instruction;
    }

    checkMemoryInstruction(instruction) {
        instruction = String(instruction);
        if(instruction === "LOAD" || instruction === "STR") { this.isMemoryInstruction = true }
        console.log(this.isMemoryInstruction);
    }

    updatePipeline(){ 


        if(this.isMemoryInstruction) {
            this.stages.writeBack = this.stages.memory; 
            this.stages.memory = this.stages.execute;
            this.stages.execute = this.stages.decode;
            this.stages.decode = this.stages.fetch;
            this.stages.fetch = null;
        }

        else {
            this.stages.writeBack = this.stages.execute; 
            this.stages.execute = this.stages.decode;
            this.stages.decode = this.stages.fetch;
            this.stages.fetch = null;
        }

        //check if the WB stage is not null, if so, set ismemoryinstruction flag back to false;
        if(this.stages.writeBack) { this.isMemoryInstruction = false; }
      
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

function askForCommand() {
    rl.question("Input Instruction: ", (instruction) => {
        if (instruction.toLowerCase() === 'e') {
            console.log("Exiting program...");
            rl.close();
            return;
        }

        //First we increment the PC
        instruction = instruction.toUpperCase(); 
        PC.write(PC.read() + 1);
        console.log(PC.read());
        //Afterwards we add the instruction to an instruction Queue:
        instructionQueue.push(instruction);
        //Then if allowed, pop off the first element ant put it into the instruction register

        //we need to check if there is a stall first before popping off the queue. 
        i = instructionQueue.shift()
        instructionReg.write(i); //we get the first element. 

        p.updatePipeline(); //clears previous instruction
        p.getInstruction(i);
   
        const inst = String(i).split(" ")[0];
        p.checkMemoryInstruction(inst);
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
            break;
            
        case 'SUB':
            break;
        
        case 'SUBI':
            break; 
        
        case 'LOAD': 
            p.updatePipeline();
            p.displayPipeline();

            LOAD(listOfInst[1], listOfInst[2]);

            break; 

        case 'STR':
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
    RdNum = Rd.slice(1);
    RnNum = Rn.slice(1);
    RmNum = Rm.slice(1);

    //Using the parameters, we call the specific registers. 
    value = registers.read(RnNum) + registers.read(RmNum);
    console.log(value);
    
    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}

//This function is wrong,, im just using it to test
function LOAD(Rd, offset) {
    p.updatePipeline();
    p.displayPipeline();

    RdNum = Rd.slice(1);
    //IN this part we get from meory
    p.updatePipeline();
    p.displayPipeline();

    p.updatePipeline();
    p.displayPipeline();
    registers.write(RdNum, Number(offset));
    
}


/*

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
