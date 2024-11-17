#Import Functions Required
import random
import math
import itertools
import time
import sqlite3
import sys
import os
import io

#Define Functions
def percentile(percent,list):
    for index, number in enumerate(list):
        if number >= percent:
            print(percent,"th Percentile = ", index, sep='')
            return

#Take User Inputs
#print("How many hours to run for?")
while True:
    try:
        # Prompt the user to enter an integer
        cyclecount = 100000 #int(input("Minimum 1000: "))
        if cyclecount > 999:
            break  # Exit the loop if input is valid
    except ValueError:
        # Handle the error if input is not a valid integer
        print("That's not a valid number. Please try again.")


arrivalrate = int(sys.argv[1])
servicetime = int(sys.argv[2])

#print("Cycles per second for precision?")
precision = 1 #int(input("Enter number above 0: "))

#Intialise All Variables
carsparked = []
arrival = 0
count_arrivals = 0
count_carsparked = [0] * int((arrivalrate * max(int(servicetime/600)+200,2) ))
utilisation = []
test = 0 
hours = 0
percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]

#Generate Arrivals

start_time = time.time()
for i in range (1,cyclecount * 3600 * precision):
    arrival = random.randint(1,3600 * precision)
    if i % 36000 == 0:
        a = round(max(count_carsparked) / sum([num for num in count_carsparked if num != 0]),5)
        if test == a:
            cyclecount = i/3600
            break
        else:
            test = a

    # Count current carpark utilisation
    count_carsparked[max(len(carsparked)-1,0)] += 1

    # Reduce parked cars time remaining by passing time
    if len(carsparked) > 0:
        carsparked = [item - 1 for item in carsparked]
        if carsparked[0] == 0:
            del carsparked[0]

    # Check if new car arrived and at to carpark
    if arrival <= arrivalrate * precision:
        count_arrivals += 1
        carsparked.append(servicetime)

# Calculate the elapsed time
end_time = time.time()
elapsed_time = end_time - start_time
print("Model completed in ", int(round(elapsed_time,0)), " seconds", sep='')

#Convert Counts to Percentages
count_carsparked = list(itertools.accumulate(count_carsparked))
count_carsparked = [round(100 * item / (cyclecount * 3600 * precision),2) for item in count_carsparked]

# Find model outputs
print("Modelled Arrivals = ", round(count_arrivals / cyclecount / precision,1))
print()

# Find Percentage Thresholds
print("Spaces Required if Unlimited Parking Avaialble")
for value in percentiles:
    percentile(value,count_carsparked)

# Calculate all percentiles
for i in range(0,100):
    for index, number in enumerate(count_carsparked):
            if number >= i:
                utilisation.append(index)
                break

# Find the index of the item '100'
if 100 in count_carsparked:
    index = count_carsparked.index(100)
# Slice the list up to and including the item '100'
    count_carsparked = count_carsparked[:index + 1]
