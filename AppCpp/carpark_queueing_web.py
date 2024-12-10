
#Import Functions Required
import random
import time

arrivalrate = 1000
servicetime = 1000
spaces = 300
precision = 1

#Define Functions
def percentageoftime(percent,list):
    cumulativesum = 0
    totaltime = sum(list)
    targetsum = totaltime * percent / 100
    for index, value in enumerate(list):
        cumulativesum += value
        if cumulativesum >= targetsum:
            return index

def modelrun(arrivalrate,servicetime,spaces):

    #Intialise All Variables
    start_time = time.time()
    count_arrivals = 0
    count_carsparked = [0] * int(spaces+1)
    count_carsqueued = [0] * int(arrivalrate * servicetime)
    carsparked = []
    cyclecount = int(10000)
    arrival = 0
    carsqueued = 0
    queue = 0
    percentiles = [10,20,30,40,50,60,70,80,90,95,98,99]
    queuetime = 0
    queuetest = 0
    hours = 0
    minimumqueue = 0

    #Generate Arrivals
    
    for i in range (1,cyclecount * 3600 ):
        if i  > 3600*1000 and i%36000 ==0:
            if queuetest == round(carsqueued/count_arrivals,5) or i == 3000*3600:
                hours = i / 3600
                break
            else:
                queuetest = round(carsqueued/count_arrivals,5)
                
        # Check if new car arrived and at to carpark
        arrival = random.randint(1,3600 * precision)
        if arrival <= arrivalrate * precision:
            count_arrivals += 1
            if len(carsparked) < spaces:
                carsparked.append(servicetime)
            else: 
                queue +=1
                carsqueued +=1
                minimumqueue += carsparked[0]


        # Count current carpark utilisation
        count_carsparked[max(len(carsparked),0)] += 1
        count_carsqueued[queue] += 1
        queuetime += queue

        # Reduce parked cars time remaining by passing time
        if len(carsparked) > 0:
            carsparked = [item - 1 for item in carsparked]

            # move finished cars out and queued cars in    
            if carsparked[0] == 0:

                del carsparked[0]
                if queue > 0:
                    carsparked.append(servicetime)
                    queue -= 1

    cyclecount = hours

    for index, value in enumerate(count_carsparked):
        count_carsparked[index] = count_carsparked[index] / (hours * 3600)

    end_time = time.time()
    elapsed_time = end_time - start_time
    print("Model completed in ", int(round(elapsed_time,0)), " seconds", sep='')
    if hours == 3000:
        print("0.00001 stability not found. ",hours,"hours of survey data generated.")
    else:
        print("Stable solution found after",hours,"hours of survey data")
    print("Cars Queued = ", round(carsqueued * 100 / count_arrivals,2),"%", sep='')
    if carsqueued > 0:
        print("Average Queue time per Arrival/Queued Vehicle = ", round(queuetime / count_arrivals),"/",round(queuetime / carsqueued),"seconds")
    # print("Random Arrivals = ", round(count_arrivals / cyclecount / precision,1))
    # print("Service Time = ", servicetime)
    print("Perfect Arrivals  Demand = ", round(count_arrivals / cyclecount / precision * servicetime / 3600,2),"spaces")
    print("Random Arrivals Demand percentiles")
    for value in percentiles:
        print(value,"th - ",percentageoftime(value,count_carsparked)," parked and ", percentageoftime(value,count_carsqueued)," Queued", sep='')

modelrun(arrivalrate,servicetime,spaces)
