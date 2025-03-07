class CacheSimulator:
    def __init__(self, cache_size, block_size, associativity, replacement_policy="LRU"):

        self.cache_size = cache_size;
        self.block_size = block_size;
        self.associativity = associativity;
        self.replacement_policy = replacement_policy;
        
        self.num_blocks = cache_size // block_size;
        if associativity:
            self.num_sets = self.num_blocks // associativity;
        else:
            self.num_sets = 1
        
        self.cache = [[] for _ in range(self.num_sets)]
        
        self.hits = 0
        self.misses = 0

