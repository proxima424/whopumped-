#!/bin/bash

echo "🚀 Setting up WhoPumped Project..."

# Function to check if a command was successful
check_error() {
    if [ $? -ne 0 ]; then
        echo "❌ Error: $1"
        exit 1
    fi
}

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd back
npm install
check_error "Failed to install backend dependencies"

# Start backend server in the background
echo "🔧 Starting backend server..."
npm start &
check_error "Failed to start backend server"
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 5

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../front
npm install
check_error "Failed to install frontend dependencies"

# Start frontend development server
echo "🎨 Starting frontend development server..."
npm start
check_error "Failed to start frontend server"

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up..."
    kill $BACKEND_PID
    exit 0
}

# Set up cleanup on script termination
trap cleanup SIGINT SIGTERM

# Keep the script running
wait
