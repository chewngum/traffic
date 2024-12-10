package handler

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os/exec"
)

func handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	// Define the Go file to execute (must be in the project folder or accessible)
	goFile := "./API/carpark.go"

	// Run the Go file using `go run`
	cmd := exec.CommandContext(context.Background(), "go", "run", goFile)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		http.Error(w, fmt.Sprintf("Execution error: %s\n%s", err.Error(), stderr.String()), http.StatusInternalServerError)
		return
	}

	// Return the output of the Go file
	w.Header().Set("Content-Type", "text/plain")
	w.Write(stdout.Bytes())
}
