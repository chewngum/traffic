
#Import Functions Required
import random
import itertools
import time
import sys

arrivalrate = int(sys.argv[1])
servicetime = int(sys.argv[2])
spaces = int(sys.argv[3])

#Define Functions
def percentage(percent,list):
    for index, number in enumerate(list):
        if number >= percent:
            return index

def modelrun(arrivalrate,servicetime,spaces):
    arrival = 0
    count_arrivals = 0
    count_carsparked_q = [0] * int(arrivalrate * int(servicetime/600)+200)
    count_carsqueued = [0] * int(arrivalrate * int(servicetime/600)+200)
    carsparked_q = []
    carsqueued = 0
    queue = 0
    queuetime = 0
    queuetest = 0
    hours = 0
    cyclecount = int(10000)

    #Generate Arrivals
    
    for i in range (1,cyclecount * 3600 ):
        if i  > 3600*100 and i%36000 ==0:
            if queuetest == round(carsqueued/count_arrivals,5) or i == 3000*3600:
                hours = i / 3600
                break
            else:
                queuetest = round(carsqueued/count_arrivals,5)
                
        # Count current carpark utilisation
        count_carsparked_q[max(len(carsparked_q)-1,0)] += 1
        count_carsqueued[queue] += 1
        queuetime += queue

        # Reduce parked cars time remaining by passing time
        if len(carsparked_q) > 0:
            carsparked_q = [item - 1 for item in carsparked_q]

            # move finished cars out and queued cars in    
            if carsparked_q[0] == 0:
                del carsparked_q[0]
                if queue > 0:
                    carsparked_q.append(servicetime)
                    queue -= 1

        # Check if new car arrived and at to carpark
        arrival = random.randint(1,3600 * precision)
        if arrival <= arrivalrate * precision:
            count_arrivals += 1
            if len(carsparked_q) - 1 < spaces:
                carsparked_q.append(servicetime)
            if len(carsparked_q) - 1 == spaces:
                queue +=1
                carsqueued +=1
            if len(carsparked_q) - 1 > spaces:
                print("more cars than spaces somehow")

    cyclecount = hours

    #Convert Counts to Percentiles
    count_carsqueued = list(itertools.accumulate(count_carsqueued))
    count_carsparked_q = list(itertools.accumulate(count_carsparked_q))
    if cyclecount > 0:
        count_carsqueued = [round(100 * item / (cyclecount * 3600 * precision),2) for item in count_carsqueued]
        count_carsparked_q = [round(100 * item / (cyclecount * 3600 * precision),2) for item in count_carsparked_q]

    for i in range(0,100):
        for index, number in enumerate(count_carsqueued):
                if number >= i:
                    count_carsqueued.append(index)
                    break
    for i in range(0,100):
        for index, number in enumerate(count_carsparked_q):
                if number >= i:
                    if number <= count_carsqueued[0]:
                        count_carsparked_q.append(index)
                        break
                        # Simple Data Outputs
    end_time = time.time()
    elapsed_time = end_time - start_time
    print("Model completed in ", int(round(elapsed_time,0)), " seconds", sep='')
    if hours == 3000:
        print("0.00001 stability not found. ",hours,"hours of survey data generated.")
    else:
        print("Stable solution found after",hours,"hours of survey data")
    if cyclecount >0:
        print("Random Arrivals = ", round(count_arrivals / cyclecount / precision,1))
        print("Service Time = ", servicetime)
        print("Linear Spaces of Demand = ", round(count_arrivals / cyclecount / precision * servicetime / 3600,2),"spaces")
    
    print("Cars Queued = ", round(carsqueued * 100 / count_arrivals,2),"%", sep='')
    print("Average Queue time per Arrival = ", round(queuetime / count_arrivals),"seconds")
    if carsqueued > 0:    
        print("Average Queue time per Queued Vehicle = ", round(queuetime / carsqueued),"seconds")
        

    print("Operating Combined Percentiles")
    for value in percentiles:
        print(value,"th percentile is ",percentage(value,count_carsparked_q)," parked and ", percentage(value,count_carsqueued)," Queued", sep='')

# print("How many hours to run for?")
while True:
    try:
        # Prompt the user to enter an integer
        cyclecount = 100000 # int(input("Minimum 1000: "))
        if cyclecount > 999:
            break  # Exit the loop if input is valid
    except ValueError:
        # Handle the error if input is not a valid integer
        print("That's not a valid number. Please try again.")


#print("Cycles per second for precision?")
precision = 1 #int(input("Enter number above 0: "))

#Intialise All Variables
arrival = 0
count_arrivals = 0
utilisation = []
count_carsparked_q = [0] * int(arrivalrate * int(servicetime/600)+2000)
count_carsqueued = [0] * int(arrivalrate * int(servicetime/600)+2000)
carsparked_q = []
carsqueued = 0
queue = 0
last_q = 0
percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]
queuedgraph = []
parkedgraph = []
queuetime = 0
queuetest = 0
hours = 0

# os.system('clear')
start_time = time.time()  

modelrun(arrivalrate,servicetime,spaces)
