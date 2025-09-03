# analytical
from decimal import Decimal, getcontext
import math

# Set precision to 50 decimal places
getcontext().prec = 5

# Parameters (as Decimals for precision)
lambda_per_hour = Decimal('15')
lambda_per_sec = lambda_per_hour / Decimal('3600')
t_cross = Decimal('30') / (Decimal('20') * Decimal('1000') / Decimal('3600'))  # ≈ 5.4s

# Expected passings per hour (μ) as Poisson mean
mu = Decimal('2') * lambda_per_hour * (Decimal('1') - (-lambda_per_sec * t_cross).exp())

# Now use Poisson distribution to find probability of ≥1 passing in an hour
# P(X ≥ 1) = 1 - e^(-μ)
p_hour_has_pass = Decimal('1') - (-mu).exp()

# Multiply over 1000 hours
expected_hours_with_pass = p_hour_has_pass * Decimal('1000')

# Print with full precision
print(f"μ (expected passings per hour)       = {mu}")
print(f"P(hour has ≥1 passing)              = {p_hour_has_pass}")
print(f"Expected hours with ≥1 passing (1000h) = {expected_hours_with_pass}")
