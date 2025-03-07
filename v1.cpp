#include <iostream>
#include <vector>

constexpr int MEMORY_SIZE = 1024; // 1KB main memory
constexpr int L1_CACHE_SIZE = 32; // 32 entries
constexpr int L2_CACHE_SIZE = 128; // 128 entries
constexpr int BLOCK_SIZE = 1; // Direct-mapped, single byte blocks

struct CacheBlock {
    int tag;
    uint8_t data;
    bool valid;
};

class Cache {
    int size;
    std::vector<CacheBlock> blocks;
    Cache* next_level;
    
public:
    Cache(int cache_size, Cache* next = nullptr) : size(cache_size), next_level(next) {
        blocks.resize(size, { -1, 0, false });
    }

    bool load(int address, uint8_t& value, int& cycles) {
        int index = (address / BLOCK_SIZE) % size;
        int tag = address / size;
        
        if (blocks[index].valid && blocks[index].tag == tag) {
            value = blocks[index].data;
            cycles += 1; // Cache hit latency
            return true; // Cache hit
        }
        
        cycles += 5; // Cache miss penalty
        if (next_level) return next_level->load(address, value, cycles); // Check next level
        return false; // Full cache miss
    }

    void store(int address, uint8_t value, std::vector<uint8_t>& memory, int& cycles) {
        int index = (address / BLOCK_SIZE) % size;
        int tag = address / size;
        
        if (blocks[index].valid && blocks[index].tag == tag) {
            blocks[index].data = value; // Update cache on hit
            cycles += 1;
        }
        
        memory[address] = value; // Write-through policy
        cycles += 10; // Memory write penalty
        
        if (next_level) next_level->store(address, value, memory, cycles);
    }
};

class MemorySystem {
    std::vector<uint8_t> memory;
    Cache L2;
    Cache L1;

public:
    MemorySystem() : memory(MEMORY_SIZE, 0), L2(L2_CACHE_SIZE), L1(L1_CACHE_SIZE, &L2) {}

    uint8_t load(int address, int& cycles) {
        uint8_t value = 0;
        if (!L1.load(address, value, cycles)) {
            value = memory[address]; // Load from memory on full miss
            cycles += 50; // Main memory latency
        }
        return value;
    }

    void store(int address, uint8_t value, int& cycles) {
        L1.store(address, value, memory, cycles);
    }
    
    void displayMemory() {
        std::cout << "Memory Contents:\n";
        for (int i = 0; i < MEMORY_SIZE; i += 16) {
            std::cout << "Addr " << i << ": ";
            for (int j = 0; j < 16; ++j) {
                std::cout << (int)memory[i + j] << " ";
            }
            std::cout << "\n";
        }
    }
};

void interactiveMemoryDemo() {
    MemorySystem memsys;
    int cycles = 0;
    while (true) {
        std::cout << "\n1. Read Memory\n2. Write Memory\n3. Display Memory\n4. Exit\nChoose an option: ";
        int choice, address, value;
        std::cin >> choice;
        
        switch (choice) {
            case 1:
                std::cout << "Enter address to read: ";
                std::cin >> address;
                cycles = 0;
                std::cout << "Value: " << (int)memsys.load(address, cycles) << ", Cycles: " << cycles << "\n";
                break;
            case 2:
                std::cout << "Enter address and value to write: ";
                std::cin >> address >> value;
                cycles = 0;
                memsys.store(address, value, cycles);
                std::cout << "Stored " << value << " at " << address << ", Cycles: " << cycles << "\n";
                break;
            case 3:
                memsys.displayMemory();
                break;
            case 4:
                return;
            default:
                std::cout << "Invalid choice. Try again.\n";
        }
    }
}

int main() {
    interactiveMemoryDemo();
    return 0;
}
