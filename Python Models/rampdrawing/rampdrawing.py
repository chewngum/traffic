import matplotlib.pyplot as plt
import matplotlib.patches as patches
from datetime import datetime
import pytz
import math

def format_ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return str(n) + suffix

def formatted_today():
    tz = pytz.timezone("Australia/Sydney")
    now = datetime.now(tz)
    weekday = now.strftime('%A')
    day = format_ordinal(now.day)
    month = now.strftime('%B')
    year = now.year
    return f"{weekday} {day} {month} {year}"

def interpret_grade(grade_input):
    try:
        t, val = grade_input.strip().split(',')
    except:
        raise ValueError("Grade must be like 'p,10' or 'r,8'.")

    if t == 'p':
        percent = float(val)
    elif t == 'r':
        if ':' in val:
            rise, run = map(float, val.split(':'))
        else:
            rise = 1.0
            run = float(val)
        if run == 0:
            raise ValueError("Invalid ratio. Run cannot be zero.")
        percent = (rise / run) * 100
    else:
        raise ValueError("Grade type must be 'p' or 'r'.")
    return percent

# Ask if demo ramp is wanted
use_demo = input("Use demo ramp? (y/n): ").strip().lower() == 'y'

if use_demo:
    sections = [
        {'length': 6.0, 'percent': 0.0},
        {'length': 2.0, 'percent': 12.5},
        {'length': 4.0, 'percent': 25.0},
        {'length': 2.0, 'percent': 12.5},
        {'length': 6.0, 'percent': 0.0}
    ]
    titleblock = False
else:
    sections = []
    while True:
        length = float(input("Enter section length (m): "))
        grade_input = input("Enter grade (e.g. 'p,10' or 'r,8'): ")
        percent = interpret_grade(grade_input)
        sections.append({'length': length, 'percent': percent})
        cont = input("Add another section? (y/n): ").lower()
        if cont != 'y':
            break
    titleblock = input("Include title block? (y/n): ").lower() == 'y'

# Ask whether to display ratio format
show_ratio = input("Show section labels with ratio (1 in X)? (y/n): ").strip().lower() == 'y'

if titleblock:
    project_id = input("Enter project ID: ")
    drawing_id = input("Enter drawing ID: ")
    company_name = input("Enter company name: ")
    client_name = input("Enter client name: ")
else:
    project_id = "Ramp Project"
    drawing_id = "Ramp-001"
    company_name = ""
    client_name = ""

today = formatted_today()

fig, axs = plt.subplots(2, 1, figsize=(12, 8))
section_ax, plan_ax = axs
line_width = 1.2
circle_size = 1.5 * line_width

start_x, start_y = 0, 0
current_x = start_x
current_y = start_y
rls = [current_y]
points = [(current_x, current_y)]

# --- Cross Section Plot ---
for sec in sections:
    dx = sec['length']
    dy = dx * sec['percent'] / 100
    next_x = current_x + dx
    next_y = current_y + dy
    section_ax.plot([current_x, next_x], [current_y, next_y], 'k-', linewidth=line_width)

    mid_x = (current_x + next_x) / 2
    mid_y = (current_y + next_y) / 2

    percent = sec['percent']
    length_str = f"{dx:.2f}m"
    if abs(percent) < 1e-6:
        grade_str = "0%"
        ratio_str = None
    elif show_ratio:
        ratio_val = 100 / abs(percent)
        grade_str = None
        ratio_str = f"1 in {ratio_val:.0f}"
    else:
        grade_str = f"{percent:.0f}%"
        ratio_str = None

    # Calculate perpendicular offset for label placement
    offset = 0.15
    length_vec = math.sqrt(dx*dx + dy*dy)
    if length_vec > 0:
        perp_x = -dy / length_vec
        perp_y = dx / length_vec
    else:
        perp_x = 0
        perp_y = 1

    label_x = mid_x + perp_x * offset
    label_y = mid_y + perp_y * offset

    # Prepare label lines
    if ratio_str is not None:
        label_lines = [length_str, "@", ratio_str]
    else:
        label_lines = [length_str, "@", grade_str]

    # Put multiline label centered horizontally and vertically
    label_text = "\n".join(label_lines)
    section_ax.text(label_x, label_y, label_text,
                    ha='center', va='center', fontsize=9,
                    bbox=dict(facecolor='white', edgecolor='none', alpha=0.8))

    # RL label slightly below the node (small downward offset)
    rl_label = f"RL{current_y:.2f}"
    section_ax.text(current_x, current_y - 0.12, rl_label,
                    ha='center', va='top', fontsize=8)
    section_ax.plot(current_x, current_y, 'ko', markersize=circle_size)

    current_x, current_y = next_x, next_y
    rls.append(current_y)
    points.append((current_x, current_y))

# Final RL point and marker
rl_label = f"RL{current_y:.2f}"
section_ax.text(current_x, current_y - 0.12, rl_label,
                ha='center', va='top', fontsize=8)
section_ax.plot(current_x, current_y, 'ko', markersize=circle_size)

section_ax.set_title("Ramp Cross Section View", fontsize=12)
section_ax.set_xlabel("Distance (m)")
section_ax.set_ylabel("Reduced Level (m)")
section_ax.grid(True)

# --- Plan View with section labels and widths ---
plan_width = 2.0
current_x = 0
for i, sec in enumerate(sections):
    dx = sec['length']
    next_x = current_x + dx
    # Draw section line
    plan_ax.plot([current_x, next_x], [0, 0], 'k-', linewidth=line_width)

    # Draw edges of ramp width as parallel lines
    plan_ax.plot([current_x, next_x], [plan_width/2, plan_width/2], 'k-', linewidth=line_width)
    plan_ax.plot([current_x, next_x], [-plan_width/2, -plan_width/2], 'k-', linewidth=line_width)

    # Draw vertical lines at section boundaries
    plan_ax.plot([current_x, current_x], [-plan_width/2, plan_width/2], 'k-', linewidth=line_width)

    # Section label text centered in the section, above the plan line
    mid_x = (current_x + next_x) / 2
    percent = sec['percent']
    if abs(percent) < 1e-6:
        label = f"{dx:.2f} m @ 0%"
    elif show_ratio:
        ratio_val = 100 / abs(percent)
        label = f"{dx:.2f} m @ {percent:.0f}% (1 in {ratio_val:.0f})"
    else:
        label = f"{dx:.2f} m @ {percent:.0f}%"
    plan_ax.text(mid_x, plan_width/2 + 0.1, label, ha='center', va='bottom', fontsize=9)

    current_x = next_x

# Final vertical line at end
plan_ax.plot([current_x, current_x], [-plan_width/2, plan_width/2], 'k-', linewidth=line_width)

plan_ax.set_title("Ramp Plan View", fontsize=12)
plan_ax.set_xlabel("Distance (m)")
plan_ax.set_ylim(-plan_width, plan_width*1.5)
plan_ax.axis('off')

# Optional title block
if titleblock:
    cell_text = [
        ["Project ID", project_id],
        ["Drawing ID", drawing_id],
        ["Date Drawn", today],
        ["Company", company_name],
        ["Client", client_name]
    ]
else:
    cell_text = [
        ["Project ID", project_id],
        ["Drawing ID", drawing_id],
        ["Date Drawn", today]
    ]

table = plt.table(cellText=cell_text,
                  colWidths=[0.15, 0.35],
                  colLabels=None,
                  loc='bottom',
                  cellLoc='left')
table.scale(1, 1.5)
plt.subplots_adjust(left=0.05, right=0.95, top=0.93, bottom=0.25)

export = input("Export to PDF? (y/n): ").lower()
if export == 'y':
    filename = drawing_id if drawing_id else "Ramp-001"
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    plt.savefig(filename, format="pdf")
    print(f"Saved drawing to {filename}")

plt.show()
