#include <iostream>
#include <vector>
#include <numeric>
#include <random>
#include <chrono>
#include <iomanip>

using namespace std;

// int percentage(int percent, const vector<int>& list) {
//     for (size_t index = 0; index < list.size(); ++index) {
//         if (list[index] >= percent) {
//             return index;
//         }
//     }
//     return -1;
// }

void modelrun(int arrivalrate, int servicetime, int spaces) {
    // Initialize Variables
    auto start_time = chrono::high_resolution_clock::now();
    int count_arrivals = 0;
    int cyclecount = 10000;
    int carsqueued = 0;
    int queue = 0;
    int queuetime = 0;
    int queuetest = 0;
    double hours = 0.0;

    vector<int> count_carsparked_q(arrivalrate * (servicetime / 600) + 200, 0);
    vector<int> count_carsqueued(arrivalrate * (servicetime / 600) + 200, 0);
    vector<int> carsparked_q;

    vector<int> percentiles = {10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99};
    mt19937 rng(random_device{}());
    uniform_int_distribution<int> distribution(1, 3600);

    // Simulation Loop
    for (int i = 1; i <= cyclecount * 3600; ++i) {
        if (i > 3600 * 100 && i % 36000 == 0) {
            if (queuetest == static_cast<int>(round(static_cast<double>(carsqueued) / count_arrivals * 10000000)) || i == 3000 * 3600) {
                hours = i / 3600.0;
                break;
            } else {
                queuetest = static_cast<int>(round(static_cast<double>(carsqueued) / count_arrivals * 10000000));
            }
        }

        // Count current carpark utilization
        count_carsparked_q[max(static_cast<int>(carsparked_q.size()) - 1, 0)]++;
        count_carsqueued[queue]++;
        queuetime += queue;

        // Reduce parked cars' time
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

        // Handle arrivals
        if (distribution(rng) <= arrivalrate) {
            count_arrivals++;
            if (static_cast<int>(carsparked_q.size()) - 1 < spaces) {
                carsparked_q.push_back(servicetime);
            } else {
                queue++;
                carsqueued++;
            }
        }
    }

    // Data Outputs
    auto end_time = chrono::high_resolution_clock::now();
    chrono::duration<double> elapsed_time = end_time - start_time;

    cout << "Model completed in " << round(elapsed_time.count()) << " seconds" << endl;
    if (hours == 3000) {
        cout << "0.00001 stability not found. " << hours << " hours of survey data generated.\n";
    } else {
        cout << "Stable solution found after " << hours << " hours of survey data.\n";
    }

    if (cyclecount > 0) {
        cout << "Random Arrivals = " << fixed << setprecision(1)
             << static_cast<double>(count_arrivals) / cyclecount << "\n";
        cout << "Service Time = " << servicetime << "\n";
        cout << "Cars Queued = " << round(static_cast<double>(carsqueued) * 100 / count_arrivals) << "%\n";
        cout << "Average Queue time per Arrival = " << round(static_cast<double>(queuetime) / count_arrivals) << " seconds\n";
    }
}

int main() {
    int arrivalrate = 1000;
    int servicetime = 1000;
    int spaces = 300;

    modelrun(arrivalrate, servicetime, spaces);

    return 0;
}
