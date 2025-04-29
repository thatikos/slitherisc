# loop_test.s - Sample SlitherRISC program
# A simple program that counts from 10 down to 0

# Initialize registers
MOVI X1, 10     # X1 = counter, start at 10
MOVI X2, 1      # X2 = decrement value
MOVI X3, 0      # X3 = loop termination value

loop:
    SUB X1, X1, X2     # Decrement counter
    BEQ X1, end        # If counter == 0, exit loop
    JMP X3             # Otherwise, jump back to loop

end:
    # Program end, CPU will halt when it reads the next instruction (0)