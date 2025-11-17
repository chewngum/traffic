#!/bin/bash

# Selective Serverless Deployment Script
# Comment out functions you don't want to deploy to reduce upload time
# Usage: ./deploy-selective.sh

set -e  # Exit on error

echo "🚀 Selective Serverless Deployment"
echo "===================================="

# Define functions to deploy (comment out unchanged functions with #)
FUNCTIONS=(
    # Compute-intensive simulation functions (all fixed for duplicate auth bug)
    # "mechanical"
    # "boomgate"
    # "carparkutilisation"
    # "carlift"
    "two-way-passing"
    # "rampdrawer"
    # "streetsection"

    # Lightweight API functions
    # "track-usage"
    # "sendform"
    # "signup"
    # "login"
    # "account"
    # "account-password"
    # "password-reset-request"
    # "password-reset-confirm"
    # "admin-users"
)

# Check if any functions are selected
if [ ${#FUNCTIONS[@]} -eq 0 ]; then
    echo "❌ No functions selected for deployment!"
    echo "Edit this script and uncomment the functions you want to deploy."
    exit 1
fi

# Build the deployment command (Serverless v4 syntax)
DEPLOY_CMD="npx serverless deploy"

# In Serverless v4, use individual deploy commands for each function
# Note: We'll deploy them one by one
DEPLOY_FUNCTIONS="${FUNCTIONS[@]}"

# Display what will be deployed
echo ""
echo "📦 Functions to deploy:"
for func in "${FUNCTIONS[@]}"; do
    echo "   ✓ $func"
done
echo ""

# Ask for confirmation
read -p "Continue with deployment? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 0
fi

# Run the deployment
echo ""
echo "🔨 Deploying functions..."
echo ""

# Deploy each function individually (Serverless v4)
for func in "${FUNCTIONS[@]}"; do
    echo "Deploying $func..."
    npx serverless deploy function --function "$func"
    if [ $? -ne 0 ]; then
        echo "❌ Failed to deploy $func"
        exit 1
    fi
    echo ""
done

echo ""
echo "✅ All functions deployed successfully!"
