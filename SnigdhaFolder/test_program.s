MOVI X1, 0        # i = 0
MOVI X2, 5        # limit = 5
MOVI X3, 64       # base memory address

loop:
ADD X4, X1, X1    # X4 = i + i
STR X4, X3, 0     # store result
ADDI X3, X3, 1    # move to next mem
ADDI X1, X1, 1    # i += 1
SUB X5, X1, X2    # temp = i - limit
BLT loop          # if i < limit, jump to loop  