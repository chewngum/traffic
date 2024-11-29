#include <iostream>
#include <vector>
#include <numeric>
#include <random>
#include <chrono>
#include <cmath>
#include <iomanip> // For formatting output

using namespace std;

// Function to find the first index where a value in the list exceeds the percentage
int percentageoftime(int percent, const vector<int>& list) {
    for (size_t index = 0; index < list.size(); ++index) {
        if (list[index] >= percent) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

// Main simulation function
void modelrun(int arrivalrate, int servicetime, int spaces) {
    // Initialize all variables
    auto start_time = chrono::high_resolution_clock::now();
    int count_arrivals = 0;
    vector<int> count_carsparked_q(arrivalrate * (servicetime / 600) + 200, 0);
    vector<int> count_carsqueued(arrivalrate * (servicetime / 600) + 200, 0);
    vector<int> carsparked_q;
    int cyclecount = 10000;
    int arrival = 0;
    int carsqueued = 0;
    int queue = 0;
    vector<int> percentiles = {10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99};
    int queuetime = 0;
    double queuetest = 0;
    double hours = 0.0;

    // Random number generator
    mt19937 rng(random_device{}());
    uniform_int_distribution<int> distribution(1, 3600);

    // Generate arrivals
    for (int i = 1; i <= cyclecount * 3600; ++i) {
        if (i > 3600 * 100 && i % 36000 == 0) {
            if (abs(queuetest - static_cast<double>(carsqueued) / count_arrivals) < 1e-5 || i == 3000 * 3600) {
                hours = i / 3600.0;
                break;
            } else {
                queuetest = static_cast<double>(carsqueued) / count_arrivals;
            }
        }

        // Count current carpark utilization
        count_carsparked_q[max(static_cast<int>(carsparked_q.size()) - 1, 0)]++;
        count_carsqueued[queue]++;
        queuetime += queue;

        // Reduce parked cars' time remaining
        if (!carsparked_q.empty()) {
            for (auto& time : carsparked_q) {
                time -= 1;
            }
            if (carsparked_q[0] == 0) {
                carsparked_q.erase(carsparked_q.begin());
                if (queue > 0) {
                    carsparked_q.push_back(servicetime);
                    queue--;
                }
            }
        }

        // Handle new arrivals
        arrival = distribution(rng);
        if (arrival <= arrivalrate) {
            count_arrivals++;
            if (static_cast<int>(carsparked_q.size()) - 1 < spaces) {
                carsparked_q.push_back(servicetime);
            } else if (static_cast<int>(carsparked_q.size()) - 1 == spaces) {
                queue++;
                carsqueued++;
            } else if (static_cast<int>(carsparked_q.size()) - 1 > spaces) {
                cerr << "Error: More cars than spaces allowed!" << endl;
            }
        }
    }

    cyclecount = static_cast<int>(hours);

    // Convert counts to percentiles
    partial_sum(count_carsqueued.begin(), count_carsqueued.end(), count_carsqueued.begin());
    partial_sum(count_carsparked_q.begin(), count_carsparked_q.end(), count_carsparked_q.begin());

    if (cyclecount > 0) {
        for (auto& item : count_carsqueued) {
            item = static_cast<int>(round(100.0 * item / (cyclecount * 3600)));
        }
        for (auto& item : count_carsparked_q) {
            item = static_cast<int>(round(100.0 * item / (cyclecount * 3600)));
        }
    }

    // Output results
    auto end_time = chrono::high_resolution_clock::now();
    chrono::duration<double> elapsed_time = end_time - start_time;

    cout << "Model completed in " << round(elapsed_time.count()) << " seconds" << endl;

    if (hours == 3000) {
        cout << "0.00001 stability not found. " << hours << " hours of survey data generated.\n";
    } else {
        cout << "Stable solution found after " << hours << " hours of survey data.\n";
    }

    cout << "Cars Queued = " << fixed << setprecision(2)
         << static_cast<double>(carsqueued) * 100 / count_arrivals << "%\n";

    if (carsqueued > 0) {
        cout << "Average Queue time per Arrival/Queued Vehicle = "
             << round(static_cast<double>(queuetime) / count_arrivals) << "/"
             << round(static_cast<double>(queuetime) / carsqueued) << " seconds\n";
    }

    cout << "Perfect Arrivals Demand = "
         << round(static_cast<double>(count_arrivals) / cyclecount * servicetime / 3600) << " spaces\n";

    cout << "Random Arrivals Demand percentiles:\n";
    for (int value : percentiles) {
        cout << value << "th - "
             << percentageoftime(value, count_carsparked_q) << " parked and "
             << percentageoftime(value, count_carsqueued) << " queued\n";
    }
}

int main() {
    int arrivalrate = 100;
    int servicetime = 100;
    int spaces = 5;

    modelrun(arrivalrate, servicetime, spaces);
    return 0;
}
