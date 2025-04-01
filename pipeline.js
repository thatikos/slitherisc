const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

function askForCommand() {
    rl.question("Input Instruction: ", (instruction) => {
        if (instruction.toLowerCase() === 'e') {
            console.log("Exiting program...");
            rl.close();
            return;
        }

        //First we increment the PC
        PC.write(PC.read() + 1);
        console.log(PC.read());
        //Afterwards we add the instruction to an instruction Queue:
        instructionQueue.push(instruction);
        //Then if allowed, pop off the first element ant put it into the instruction register

        //we need to check if there is a stall first before popping off the queue. 
        instructionReg.write(instructionQueue.shift()); //we get the first element. 


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
    switch(listOfInst[0].toUpperCase()){
        case 'ADD':
            //Insert ADD function 
            ADD(listOfInst[1], listOfInst[2], listOfInst[3]); 
            break; 
        case 'ADDI':
            break;
            
        case 'SUB':
            break;
        
        case 'SUBI':
            break; 
        
        case 'LOAD': 
            break; 

        case 'STR':
            break; 
        
    }
    return; 
}

function ADD(Rd, Rn, Rm) {

    //there's probaby a less redundant way of doing this,, im too lazy rn 
    RdNum = Rd.slice(1);
    RnNum = Rn.slice(1);
    RmNum = Rm.slice(1);

    //Using the parameters, we call the specific registers. 
    value = registers.read(RnNum) + registers.read(RmNum);
    console.log(value);
    registers.write(RdNum, value);

    console.log(`This is the Value in Register ${Rd}: ${registers.read(RdNum)}`);
}

function SUB(Rd, Rn, Rm) {
    return; 
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
