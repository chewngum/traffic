#Import Functions Required
import random
import math
import itertools
import time
import sqlite3
import sys
import os
import io
# os.system('clear')

arrivalrate = int(sys.argv[1])
servicetime = int(sys.argv[2])
spaces = int(sys.argv[3])
#import matplotlib.pyplot as plt

#Define Functions
def percentile(percent,list):
    for index, number in enumerate(list):
        if number >= percent:
            print(percent,"th Percentile = ", index, sep='')
            return


precision = 1 #int(input("Enter number above 0: "))
cyclecount = 10000

#Intialise All Variables
carsparked = []
arrival = 0
count_arrivals = 0
count_carsparked = [0] * int((arrivalrate * max(int(servicetime/600)+200,2) ))
utilisation = []
count_serviced = 0
count_blocked = 0
count_carsparked_q = [0] * int((arrivalrate * max(int(servicetime/600)+200,2) ))
carsparked_q = [0]
carsqueued = [0]
percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]
blocktest = 0
hours = 0

#Generate Arrivals
start_time = time.time()
for i in range (1,cyclecount * 3600 * precision):
    if i % 36000  == 0 and i  > 3600*1500:
        if blocktest == round(count_blocked/count_arrivals,5):
            hours = i / 3600
            break
        else:
            blocktest = round(count_blocked/count_arrivals,5)

    arrival = random.randint(1,3600 * precision)

    # Count current carpark utilisation
    count_carsparked[max(len(carsparked)-1,0)] += 1

    # Reduce parked cars time remaining by passing time
    if len(carsparked) > 0:
        carsparked = [item - 1 for item in carsparked]
        if carsparked[0] == 0:
            del carsparked[0]

    # Check if new car arrived and add to carpark
    if arrival <= arrivalrate * precision:
        count_arrivals += 1
        if len(carsparked)-1 < spaces:
            carsparked.append(servicetime)
            count_serviced += 1
        if len(carsparked)-1 == spaces:
            count_blocked += 1


# Calculate the elapsed time in reality and model
cyclecount = hours
end_time = time.time()
elapsed_time = end_time - start_time
print("Model completed in ", int(round(elapsed_time,0)), " seconds", sep='')
print(hours, "Hours modelled until stable results")


#Convert Counts to Percentages
count_carsparked = list(itertools.accumulate(count_carsparked))
count_carsparked = [round(100 * item / (cyclecount * 3600 * precision),2) for item in count_carsparked]

# Find model outputs
print("Modelled Arrivals = ", round(count_arrivals / cyclecount / precision,1))

# Find Percentage Thresholds
print("Spaces Required if no queue option (Erlang-Blocking)")
for value in percentiles:
    percentile(value,count_carsparked)
print("Cars Blocked: ", round(count_blocked*100/(count_blocked+count_serviced),2),"%", sep='')

# Calculate percentiles
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

# for value in count_carsparked:
#     print(value)
# Create a plot
#plt.scatter(list(range(len(utilisation))),utilisation)
#plt.title("Parking Space Utilisation")
#plt.xlabel("Percentile Check")
#plt.ylabel("Parking Spaces")
#plt.grid(True, axis='both', color='red', linestyle='dotted', linewidth=1, which='both')
#plt.show()

# count_carsparked_db = [(i+1, item) for i , item in enumerate(count_carsparked)]
# conn = sqlite3.connect('numbers.db')
# cursor = conn.cursor()
# cursor.execute('''
#     CREATE TABLE IF NOT EXISTS blocking_count_carsparked (
#         ID int PRIMARY KEY,
#         NUMBER int
#     )
# ''')
# cursor.executemany('INSERT INTO blocking_count_carsparked (ID, NUMBER) VALUES(?, ?)', count_carsparked_db)
# conn.commit()
# conn.close()

# conn = sqlite3.connect('numbers.db')
# cursor = conn.cursor()

# cursor.execute('SELECT * FROM blocking_count_carsparked')
# rows = cursor.fetchall()

# for row in rows:
#     print(row)

# conn.close()