from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess

app = Flask(__name__)
CORS(app)

def python_script1():
    import carpark_queueing_web

def python_script2():
    import carpark_blocking_web

def python_script2():
    import carpark_queueing_web

@app.route('/')
def index():
    return open('Index.html').read()

@app.route('/run-script1', methods=['POST'])
def run_script1():
    data = request.json
    input1 = data.get('input1')
    input2 = data.get('input2')
    input3 = data.get('input3')

    try:
        # Pass these integers as needed to your script
        result = subprocess.run(
            ['python3', 'carpark.py', str(input1), str(input2), str(input3)],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout
    except subprocess.CalledProcessError as e:
        output = f"Error: {e.stderr}"

    return jsonify({"output": output})

@app.route('/run-script2', methods=['POST'])
def run_script2():
    data = request.json
    input1 = data.get('input1')
    input2 = data.get('input2')
    input3 = data.get('input3')

    try:
        # Pass these integers as needed to your script
        result = subprocess.run(
            ['python3', 'carpark_blocking_web.py', str(input1), str(input2), str(input3)],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout
    except subprocess.CalledProcessError as e:
        output = f"Error: {e.stderr}"

    return jsonify({"output": output})

@app.route('/run-script3', methods=['POST'])
def run_script3():
    data = request.json
    input1 = data.get('input1')
    input2 = data.get('input2')
    input3 = data.get('input3')

    try:
        # Pass these integers as needed to your script
        result = subprocess.run(
            ['python3', 'carpark_queueing_web.py', str(input1), str(input2), str(input3)],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout
    except subprocess.CalledProcessError as e:
        output = f"Error: {e.stderr}"

    return jsonify({"output": output})

if __name__ == '__main__':
    app.run(debug=True)
