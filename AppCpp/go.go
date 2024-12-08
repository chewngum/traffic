package main

import (
	"fmt"
	"math/rand"
	"time"
)

// Parameters
const (
	arrivalRate = 100
	serviceTime = 10
	spaces      = 1
	precision   = 1
)

// percentageOfTime calculates the index at which a cumulative sum of values in the list reaches or exceeds the specified percentage.
func percentageOfTime(percent float64, list []int) int {
	cumulativeSum := 0
	totalTime := 0
	for _, value := range list {
		totalTime += value
	}
	targetSum := int(float64(totalTime) * percent / 100)

	for index, value := range list {
		cumulativeSum += value
		if cumulativeSum >= targetSum {
			return index
		}
	}
	return 0
}

func modelRun(arrivalRate, serviceTime, spaces int) {
	// Initialize variables
	startTime := time.Now()
	countArrivals := 0
	countCarsParked := make([]int, arrivalRate*serviceTime)
	countCarsQueued := make([]int, arrivalRate*serviceTime)
	carsParked := []int{}
	cycleCount := 10000
	carsQueued := 0
	queue := 0
	percentiles := []float64{10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99}
	queueTime := 0
	queueTest := 0.0
	hours := 0.0

	rand.Seed(time.Now().UnixNano()) // Seed the random number generator

	// Generate arrivals
	for i := 1; i <= cycleCount*3600; i++ {
		if i > 3600*1000 && i%36000 == 0 {
			if queueTest == float64(carsQueued)/float64(countArrivals) || i == 3000*3600 {
				hours = float64(i) / 3600
				break
			} else {
				queueTest = float64(carsQueued) / float64(countArrivals)
			}
		}

		// Check if a new car arrived and add to the car park
		arrival := rand.Intn(3600*precision) + 1
		if arrival <= arrivalRate*precision {
			countArrivals++
			if len(carsParked) -1 < spaces {
				carsParked = append(carsParked, serviceTime)
			} else {
				queue++
				carsQueued++
			}
		}

		// Count current car park utilization
		index := max(len(carsParked)-1, 0)
		countCarsParked[index]++
		countCarsQueued[queue]++
		queueTime += queue

		// Reduce parked cars' time remaining
		if len(carsParked) >=1 {
			for j := range carsParked {
				carsParked[j]--
			}

			// Move finished cars out and queued cars in
			if carsParked[0] == 0 {
				carsParked = carsParked[1:]
				if queue > 0 {
					carsParked = append(carsParked, serviceTime)
					queue--
				}
			}
		}
	}

	elapsedTime := time.Since(startTime).Seconds()
	fmt.Printf("Model completed in %.0f seconds\n", elapsedTime)
	if hours == 3000 {
		fmt.Printf("0.00001 stability not found. %.0f hours of survey data generated.\n", hours)
	} else {
		fmt.Printf("Stable solution found after %.0f hours of survey data.\n", hours)
	}
	fmt.Printf("Cars Queued = %.2f%%\n", float64(carsQueued*100)/float64(countArrivals))
	if carsQueued > 0 {
		fmt.Printf("Average Queue time per Arrival/Queued Vehicle = %.0f/%.0f seconds\n",
			float64(queueTime)/float64(countArrivals), float64(queueTime)/float64(carsQueued))
	}
	fmt.Printf("Perfect Arrivals Demand = %.2f spaces\n",
		float64(countArrivals)/hours*float64(serviceTime)/3600)

	fmt.Println("Random Arrivals Demand percentiles:")
	for _, value := range percentiles {
		parkedIndex := percentageOfTime(value, countCarsParked)
		queuedIndex := percentageOfTime(value, countCarsQueued)
		fmt.Printf("%.0fth - %d parked and %d queued\n", value, parkedIndex, queuedIndex)
	}
	
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func main() {
	modelRun(arrivalRate, serviceTime, spaces)
}
