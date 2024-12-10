#Import Functions Required
import random
import itertools
import time
import sys

#Define Functions
def percentageoftime(percent,list):
    cumulativesum = 0
    totaltime = sum(list)
    targetsum = totaltime * percent / 100
    for index, value in enumerate(list):
        cumulativesum += value
        if cumulativesum >= targetsum:
            return index

arrivalrate = int(sys.argv[1])
servicetime = int(sys.argv[2])

#print("Cycles per second for precision?")
precision = 1 #int(input("Enter number above 0: "))

#Intialise All Variables
carsparked = []
arrival = 0
count_arrivals = 0
count_carsparked = [0] * int(arrivalrate * servicetime) 
utilisation = []
test = 0 
hours = 0
percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]
cyclecount = 1000

#Generate Arrivals

start_time = time.time()
for i in range (1,cyclecount * 3600 * precision):
    arrival = random.randint(1,3600 * precision)
    if i >= 3600*cyclecount:
        break

    # Count current carpark utilisation
    count_carsparked[max(len(carsparked),0)] += 1

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

# Find model outputs
print("Modelled Arrivals = ", round(count_arrivals / cyclecount / precision,1))

# Find Percentage Thresholds
print("Spaces Required if Unlimited Parking Avaialble")
for value in percentiles:
    print(value,"th percentile - ",percentageoftime(value,count_carsparked), sep='')
