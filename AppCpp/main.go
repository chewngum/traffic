package main

import (
	"fmt"
	"math/rand"
	"time"
	"math"
	"os"
	"strconv"
)

var (
	arrivalRate, err1 = strconv.Atoi(os.Args[1])
	serviceTime, err2 = strconv.Atoi(os.Args[2])
	spaces, err3     = strconv.Atoi(os.Args[3])
	precision   = 1


)

func percentageOfTime(percent float64, arr []float64) int {
	cumulativesum := 0.0
	total := 0.0
	for _, value := range arr{
		total += value
	}

	targetsum := float64(percent * total / 100)
	for i, value := range arr {
		cumulativesum += value
		if cumulativesum >= targetsum {
			return i
		}
	}
	return 0
}

func modelRun(arrivalRate, serviceTime, spaces int) {
	// Initialize variables
	if err1 != nil || err2 != nil || err3 != nil {
		fmt.Println("All three arguments must be valid integers.")
		if err1 != nil {
			fmt.Printf("Error in argument 1: %v\n", err1)
		}
		if err2 != nil {
			fmt.Printf("Error in argument 2: %v\n", err2)
		}
		if err3 != nil {
			fmt.Printf("Error in argument 3: %v\n", err3)
		}
		return
	}

	startTime := time.Now()
	cycleHours := 10000 * 3600
	countArrivals := 0
	carsQueued := 0
	queue := 0
	queueTime := 0
	queueTest := 0.0
	hours := 0.0
	percentiles := []float64{10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99}

	// Create slices for parked and queued cars
	maxSize := int(float64(arrivalRate*serviceTime))
	countcarsparked := make([]float64, maxSize)
	countCarsQueued := make([]float64, maxSize)
	carsparked := []int{}

	// Generate arrivals and process cycles
	for i := 1; i <= cycleHours; i++ {
		// Check for stabilization
		if i > 3600*1000 && i%36000 == 0 {
			currentQueueRatio := float64(carsQueued) / float64(countArrivals)
			 if math.Abs(queueTest-currentQueueRatio) <= 1e-5 || i == 3000*3600 {
				hours = float64(i / 3600)
				break
			}
			queueTest = currentQueueRatio
		}

		// Simulate new arrivals
		arrival := rand.Intn(3600*precision) + 1
		if arrival <= arrivalRate*precision {
			countArrivals++
			if len(carsparked)-1 < spaces {
				carsparked = append(carsparked, serviceTime)
			} else {
				queue++
				carsQueued++
			}
		}
		if i%36000 == 0 && countArrivals > 0{
			fmt.Printf("qr %.4f \n", float64(carsQueued) / float64(countArrivals))
			fmt.Printf("ho %.0f \n", float64(i/3600))
		}
		// Update counts for parked and queued cars
		if len(carsparked) >= 2 {
			countcarsparked[len(carsparked)-1]++
		} else {
			countcarsparked[0]++
		}
		countCarsQueued[queue]++
		queueTime += queue

		// Reduce time remaining for parked cars
		newCarsParked := []int{}
		for _, timeLeft := range carsparked {
			if timeLeft > 0 {
				newCarsParked = append(newCarsParked, timeLeft-1)
			}
		}
		carsparked = newCarsParked
		if len(carsparked) - 1 < spaces && queue > 0 {
			carsparked = append(carsparked, serviceTime)
			queue--
		}
	}
	// Output results
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
		parkedIndex := percentageOfTime(value, countcarsparked)
		queuedIndex := percentageOfTime(value, countCarsQueued)
		fmt.Printf("%.0fth - %d parked and %d queued\n", value, parkedIndex, queuedIndex)
	}
	
}

func main() {
	modelRun(arrivalRate, serviceTime, spaces)
}