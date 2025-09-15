import numpy as np
import random

def method3_simulation(num_hours=10000, seed=42):
    if seed is not None:
        np.random.seed(seed)
        random.seed(seed)
    
    lambda1 = 15  # cars/hour direction 1
    lambda2 = 15  # cars/hour direction 2  
    travel_time = 5.4  # seconds
    T = 3600  # seconds per hour
    
    hours_with_overlap = 0
    
    for _ in range(num_hours):
        # Direction 1 arrivals
        n1 = np.random.poisson(lambda1)
        
        # Vulnerable time for this hour
        vulnerable_time_this_hour = n1 * 2 * travel_time
        
        # Expected Direction 2 arrivals during vulnerable time
        expected_dir2_in_vulnerable = lambda2 * (vulnerable_time_this_hour / T)
        
        # Simulate overlaps
        actual_overlaps = np.random.poisson(expected_dir2_in_vulnerable)
        
        if actual_overlaps > 0:
            hours_with_overlap += 1
    
    percentage = (hours_with_overlap / num_hours) * 100
    return percentage

def correct_simulation(num_hours=5000, seed=42):
    np.random.seed(seed)
    random.seed(seed)
    
    hours_with_overlap_correct = 0
    
    for _ in range(num_hours):
        n1 = np.random.poisson(15)
        n2 = np.random.poisson(15)
        
        if n1 == 0 or n2 == 0:
            continue
        
        arrivals1 = [random.uniform(0, 3600) for _ in range(n1)]
        arrivals2 = [random.uniform(0, 3600) for _ in range(n2)]
        
        overlap_found = any(abs(t1 - t2) < 5.4 for t1 in arrivals1 for t2 in arrivals2)
        if overlap_found:
            hours_with_overlap_correct += 1
    
    return (hours_with_overlap_correct / num_hours) * 100

if __name__ == "__main__":
    m3_percentage = method3_simulation(num_hours=10000)
    correct_percentage = correct_simulation(num_hours=5000)
    
    print(f"Method 3: {m3_percentage:.2f}%")
    print(f"Correct:  {correct_percentage:.2f}%")
    print(f"Difference: {abs(m3_percentage - correct_percentage):.2f} percentage points")
