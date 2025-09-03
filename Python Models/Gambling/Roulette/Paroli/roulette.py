import random
import matplotlib.pyplot as plt

def baccarat_player_outcome():
    """Simulate a Player bet in Baccarat."""
    rnd = random.random()
    if rnd < 0.4462:
        return 'win'
    elif rnd < 0.4462 + 0.4586:
        return 'loss'
    else:
        return 'tie'

def paroli_final_bankroll_player(starting_bankroll=1000, base_bet=10, max_streak=5,
                                 rounds=500, profit_target_ratio=0.5):
    bankroll = starting_bankroll
    profit_target = starting_bankroll * (1 + profit_target_ratio)
    current_bet = base_bet
    win_streak = 0

    for _ in range(rounds):
        if bankroll < current_bet or bankroll >= profit_target:
            break

        outcome = baccarat_player_outcome()

        if outcome == 'win':
            bankroll += current_bet
            win_streak += 1
            if win_streak >= max_streak:
                current_bet = base_bet
                win_streak = 0
            else:
                current_bet *= 2
        elif outcome == 'loss':
            bankroll -= current_bet
            current_bet = base_bet
            win_streak = 0
        else:  # tie
            pass  # no change to bankroll or streak

    return bankroll

# Run 1000 simulations
num_trials = 10000
starting_bankroll = 1000
bin_size = starting_bankroll * 0.5
final_bankrolls = [paroli_final_bankroll_player() for _ in range(num_trials)]

# Bin final bankrolls in 5% chunks
bins = {}
for b in final_bankrolls:
    percent_chunk = int(((b - starting_bankroll) / bin_size))
    bin_label = f"{int(100 + percent_chunk * 50)}%"
    bins[bin_label] = bins.get(bin_label, 0) + 1

# Sort and print results
sorted_bins = dict(sorted(bins.items(), key=lambda x: int(x[0].strip('%'))))
for k, v in sorted_bins.items():
    print(f"{k}: {v}")
