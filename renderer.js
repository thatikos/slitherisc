// renderer.js
import { Pipeline } from './pipeline.mjs';
import { MemorySystem } from './cache-simulator.mjs';

// Create a shared instance of the memory system
const memorySystem = new MemorySystem();

// Create the pipeline with the shared memory system
const pipeline = new Pipeline();
pipeline.memorySystem = memorySystem;

// Global state
window.simMode = "normal"; // <-- global mode setting
let loadedProgram = []; // Store loaded program binary
let running = false;    // Flag for continuous running
let mode = "normal";    // Execution mode

// Initialize the simulation with the default mode
function initializeSimulation() {
  updateSimulationMode("normal");
  document.getElementById('mode').value = "normal";
  
  // Make sure we have a running indicator element
  if (!document.getElementById('running-indicator')) {
    const indicator = document.createElement('span');
    indicator.id = 'running-indicator';
    indicator.className = 'status-indicator';
    document.querySelector('.control-panel').appendChild(indicator);
  }
  
  updateRunningIndicator('Ready');
  updateDisplays();
}

// Update running indicator with proper styling
function updateRunningIndicator(status) {
  const indicator = document.getElementById('running-indicator');
  if (!indicator) return;
  
  indicator.textContent = status;
  
  switch (status) {
    case 'Running':
      indicator.style.color = 'green';
      break;
    case 'Stopped':
    case 'Halted':
      indicator.style.color = 'red';
      break;
    case 'Reset':
      indicator.style.color = 'blue';
      break;
    default:
      indicator.style.color = 'black';
  }
}

// Update simulation mode
function updateSimulationMode(newMode) {
  mode = newMode;
  window.simMode = newMode;
  
  console.log(`Setting simulation mode to: ${newMode}`);
  
  // Reset before configuring
  pipeline.reset();
  memorySystem.reset();
  
  // Configure pipeline and memory system based on mode
  if (newMode === "normal") {
    // Disable both cache and pipeline
    pipeline.enablePipeline(false);
    memorySystem.enableCache(false);
  } else if (newMode === "cache") {
    // Enable cache only
    pipeline.enablePipeline(false);
    memorySystem.enableCache(true);
  } else if (newMode === "pipeline") {
    // Enable pipeline only
    pipeline.enablePipeline(true);
    memorySystem.enableCache(false);
  } else if (newMode === "both") {
    // Enable both
    pipeline.enablePipeline(true);
    memorySystem.enableCache(true);
  }
  
  console.log(`Simulation mode updated to: ${newMode}`);
  console.log(`Pipeline enabled: ${pipeline.pipelineEnabled}`);
  console.log(`Cache enabled: ${memorySystem.cacheEnabled}`);
  
  // Update display to reflect new mode
  updateDisplays();
}

// Add event listeners after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, setting up event listeners');
  
  document.getElementById('hardcoded-test').addEventListener('click', loadHardcodedTestProgram);
  document.getElementById('load-program').addEventListener('click', loadProgramHandler);
  document.getElementById('single-step').addEventListener('click', singleStepHandler);
  document.getElementById('run').addEventListener('click', runHandler);
  document.getElementById('reset').addEventListener('click', resetHandler);
  document.getElementById('mode').addEventListener('change', modeChangeHandler);
  
  // Make sure the stop button has an event listener
  if (document.getElementById('stop')) {
    document.getElementById('stop').addEventListener('click', stopHandler);
    console.log('Stop button event listener added');
  } else {
    console.error('Stop button not found in the DOM!');
  }
  
  // Initialize the simulation
  initializeSimulation();
});

// Fixed loadProgramHandler to properly load program into memory
async function loadProgramHandler() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.bin';

  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        console.log(`File loaded: ${file.name}, size: ${arrayBuffer.byteLength} bytes`);
        
        // Create DataView to handle binary data correctly
        const dataView = new DataView(arrayBuffer);
        const wordCount = Math.floor(arrayBuffer.byteLength / 4);
        loadedProgram = [];
        
        console.log(`Program has ${wordCount} 32-bit words`);
        
        // Clear memory before loading new program
        resetHandler();
        
        // Load each 32-bit word (big-endian format from assembler)
        for (let i = 0; i < wordCount; i++) {
          const word = dataView.getUint32(i * 4, false); // false = big-endian
          loadedProgram.push(word);
          
          // Calculate memory location
          const lineIndex = Math.floor(i / 16);
          const offset = i % 16;
          
          // Store in memory
          memorySystem.memory.data[lineIndex][offset] = word;
          
          console.log(`Loaded instruction ${i}: 0x${word.toString(16).padStart(8, '0')} at memory[${lineIndex}][${offset}]`);
        }
        
        // Reset halted state and PC
        pipeline.halted = false;
        pipeline.pc = 0;
        
        // Force update displays to show memory content
        updateDisplays();
        
        console.log('Program loaded successfully. First instruction:', 
          loadedProgram[0].toString(16).padStart(8, '0'));
          
        alert(`Successfully loaded ${loadedProgram.length} instructions`);
      } catch (error) {
        console.error('Failed to load program:', error);
        alert('Error loading program: ' + error.message);
      }
    }
  };
  input.click();
}

function loadHardcodedTestProgram() {
  // Reset simulator state
  resetHandler();
  
  // These are the instruction encodings that match our simulator's expectations
  const testProgram = [
    0x0600100a,  // MOVI X1, 10
    0x06002005,  // MOVI X2, 5
    0x00140c00,  // ADD X3, X1, X2
    0x01141000   // SUB X4, X1, X2
  ];
  
  loadedProgram = testProgram;
  
  // Load into memory at address 0
  for (let i = 0; i < testProgram.length; i++) {
    const lineIndex = Math.floor(i / 16);
    const offset = i % 16;
    
    memorySystem.memory.data[lineIndex][offset] = testProgram[i];
    
    console.log(`Hardcoded test program - Mem[${i}] = 0x${testProgram[i].toString(16).padStart(8, '0')}`);
  }
  
  // Reset halted state and PC
  pipeline.halted = false;
  pipeline.pc = 0;
  
  // Force update displays
  updateDisplays();
  
  alert("Hardcoded test program loaded!");
}

// Handler for the single step button
function singleStepHandler() {
  console.log('Single stepping');
  
  if (pipeline.halted) {
    alert("Program halted! Reset to continue.");
    return;
  }
  
  pipeline.clock();
  updateDisplays();
}

// Handler for the run button
function runHandler() {
  console.log('Run button clicked, setting running = true');
  
  if (pipeline.halted) {
    alert("Program halted! Reset to continue.");
    return;
  }
  
  running = true;
  
  // Update status indicator
  updateRunningIndicator('Running');
  
  // Disable run button while running
  document.getElementById('run').disabled = true;
  
  runProgram();
}

// Handler for the stop button
function stopHandler() {
  console.log('Stop button clicked, setting running = false');
  running = false;
  
  // Update status indicator
  updateRunningIndicator('Stopped');
  
  // Re-enable run button
  document.getElementById('run').disabled = false;
}

// Handler for the reset button
function resetHandler() {
  console.log('Resetting pipeline and memory');
  pipeline.reset();
  memorySystem.reset();
  
  // Make sure running is false
  running = false;
  
  // Re-enable run button
  document.getElementById('run').disabled = false;
  
  // Update status indicator
  updateRunningIndicator('Reset');
  
  // Reapply current mode after reset
  updateSimulationMode(mode);
  
  updateDisplays();
}

// Handler for the mode change dropdown
function modeChangeHandler(e) {
  console.log(`Mode changed to: ${e.target.value}`);
  updateSimulationMode(e.target.value);
}

// Main program execution loop
async function runProgram(maxCycles = 1000) {
  console.log('Starting program execution loop');
  
  const startCycles = pipeline.cycles; // Store starting cycle count
  
  try {
    while (running && !pipeline.halted) {
      // Check if we've exceeded the maximum number of cycles
      if (pipeline.cycles - startCycles > maxCycles) {
        console.log(`Reached maximum cycle limit of ${maxCycles}`);
        running = false;
        break;
      }
      
      pipeline.clock();
      updateDisplays();
      
      // Add a small delay to allow UI updates and event handling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check again if running flag has been changed
      if (!running || pipeline.halted) {
        console.log("Execution stopped, running=" + running + ", halted=" + pipeline.halted);
        break;
      }
    }
  } catch (error) {
    console.error("Error during program execution:", error);
    running = false;
  }
  
  // Reset running flag when finished
  running = false;
  
  // Update status indicator
  updateRunningIndicator(pipeline.halted ? 'Halted' : 'Stopped');
  
  // Re-enable run button
  document.getElementById('run').disabled = false;
  
  console.log('Program execution loop finished');
}

// Update all displays
function updateDisplays() {
  // Enhanced register display
  const regState = pipeline.getRegisterState();
  const regDisplay = document.getElementById('registers');
  if (regDisplay) {
    regDisplay.textContent = regState.map((r, i) => 
      `X${i.toString().padStart(2, '0')}: 0x${r.toString(16).padStart(8, '0')}`
    ).join('\n');
  }

  // Enhanced pipeline display
  const pipeState = pipeline.getPipelineState();
  let pipeText = '';
  for (const [stage, info] of Object.entries(pipeState)) {
    pipeText += `${stage.toUpperCase()}: `;
    if (info.instruction) {
      pipeText += `0x${info.instruction.toString(16).padStart(8, '0')}\n`;
    } else {
      pipeText += 'Empty\n';
    }
  }
  const pipeDisplay = document.getElementById('pipeline');
  if (pipeDisplay) {
    pipeDisplay.textContent = pipeText;
  }

  // Enhanced memory display
  let memOutput = '';
  for (let i = 0; i < 5; i++) {
    const line = memorySystem.memory.viewLine(i);
    memOutput += `Mem[${i * 16}]: `;
    memOutput += line.map(word => `0x${word.toString(16).padStart(8, '0')}`).join(' ');
    memOutput += '\n';
  }
  const memDisplay = document.getElementById('memory');
  if (memDisplay) {
    memDisplay.textContent = memOutput;
  }

  // Enhanced cache display
  let cacheOutput = '';
  cacheOutput += `Cache Status: ${memorySystem.cacheEnabled ? 'Enabled' : 'Disabled'}\n\n`;
  for (let i = 0; i < 5; i++) {
    const line = memorySystem.cache.viewLine(i);
    cacheOutput += `Cache[${i}] (valid=${line.valid}, tag=${line.tag}): `;
    cacheOutput += line.data.map(word => `0x${word.toString(16).padStart(8, '0')}`).join(' ');
    cacheOutput += '\n';
  }
  const cacheDisplay = document.getElementById('cache');
  if (cacheDisplay) {
    cacheDisplay.textContent = cacheOutput;
  }

  // Update stats
  const statsDisplay = document.getElementById('cycle-stats');
  if (statsDisplay) {
    statsDisplay.textContent = formatStats();
  }
}

function formatStats() {
  const stats = memorySystem.getStats();
  const perf = pipeline.getPerformanceStats();
  
  return `
Simulation Mode: ${mode}
Pipeline Enabled: ${pipeline.pipelineEnabled ? 'Yes' : 'No'}
Cache Enabled: ${memorySystem.cacheEnabled ? 'Yes' : 'No'}
Cycle Count: ${perf.cycles}
Instructions: ${perf.instructions}
Instructions/Cycle: ${perf.ipc.toFixed(2)}
Stalls: ${perf.stalls}
Stall Rate: ${(perf.stallRate * 100).toFixed(2)}%
Cache Hits: ${stats.cacheHits}
Cache Misses: ${stats.cacheMisses}
Cache Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%
Program Counter: ${pipeline.pc}
Halted: ${pipeline.halted ? 'Yes' : 'No'}
  `.trim();
}