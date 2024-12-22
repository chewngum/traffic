package main

import (
	"flag"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"os"
	"time"
	"os"
	"strconv"
)

var (
	arrivalRate, err1 = strconv.Atoi(os.Args[1])
	serviceTime, err2 = strconv.Atoi(os.Args[2])
	spaces, err3     = strconv.Atoi(os.Args[3])
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
	return 101010101010
}

func modelRun(inp CarparkInputs) {
	startTime := time.Now()
	countArrivals := 0
	countCarsParked := make([]int, inp.spaces+1)
	countCarsQueued := make([]int, inp.arrivalRate*inp.serviceTime)
	carsParked := []int{}
	cycleCount := 1000000
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
			currentQueueRatio := float64(carsQueued) / float64(countArrivals)
			hours = float64(i) / 3600
			if math.Abs(queueTest-currentQueueRatio) <= 1e-6  {
				break
			} else {
				queueTest = currentQueueRatio
			}
		}

		// Check if a new car arrived and add to the car park
		arrival := rand.Intn(3600*inp.precision) + 1
		if arrival <= inp.arrivalRate*inp.precision {
			countArrivals++
			if len(carsParked) < inp.spaces {
				carsParked = append(carsParked, inp.serviceTime)
			} else {
				queue++
				carsQueued++
			}
		}

		// Count current car park utilization
		index := max(len(carsParked), 0)
		countCarsParked[index]++
		countCarsQueued[queue]++
		queueTime += queue

		// Reduce parked cars' time remaining
		if len(carsParked) >= 1 {
			for j := range carsParked {
				carsParked[j]--
			}

			// Move finished cars out and queued cars in
			if carsParked[0] == 0 {
				carsParked = carsParked[1:]
				if queue > 0 {
					carsParked = append(carsParked, inp.serviceTime)
					queue--
				}
			}
		}
	}

	elapsedTime := time.Since(startTime).Milliseconds()
	fmt.Printf("Model completed in %.dms\n", elapsedTime)
	if hours == 3000 {
		fmt.Printf("0.00001 stability not found. %.0f hours of survey data generated.\n", hours)
	} else {
		fmt.Printf("Stable solution found after %.0f hours of survey data.\n", hours)
	}
	fmt.Printf("Cars Queued = %.1f%%\n", float64(carsQueued*100)/float64(countArrivals))
	if carsQueued > 0 {
		fmt.Printf("Average Queue time per Arrival/Queued Vehicle = %.1f / %.1f seconds\n",
			float64(queueTime)/float64(countArrivals), float64(queueTime)/float64(carsQueued))
	}
	fmt.Printf("Theoretical minimum spaces for requested/model demand = %.2f / %.2f spaces\n",
		float64(countArrivals)/hours*float64(inp.serviceTime)/3600, float64(int(inp.arrivalRate)*int(inp.serviceTime))/3600)

	fmt.Println("Random Arrivals Demand percentiles:")
	for _, value := range percentiles {
		parkedIndex := percentageOfTime(value, countCarsParked)
		queuedIndex := percentageOfTime(value, countCarsQueued)
		fmt.Printf("%.0fth - %d parked and %d queued\n", value, parkedIndex, queuedIndex)
	}

}

func main() {
	var inputs CarparkInputs

	// Parse command line arguments
	// e.g., go run api/carpark.go -arrivalRate=50 -precision=3 -serviceTime=90 -spaces=5
	flag.IntVar(&inputs.arrivalRate, "arrivalRate", 100, "Number of cars arriving per hour")
	flag.IntVar(&inputs.precision, "precision", 1, "Precision required for arrival rate")
	flag.IntVar(&inputs.serviceTime, "serviceTime", 100, "How long a car stays in the carpark")
	flag.IntVar(&inputs.spaces, "spaces", 10, "Number of spaces in the carpark")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	logger.Info("running model", "arrivalRate", inputs.arrivalRate, "precision", inputs.precision, "serviceTime", inputs.serviceTime, "spaces", inputs.spaces)

	modelRun(inputs)
}
