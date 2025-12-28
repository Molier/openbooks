#!/bin/bash
# Quick start script for OpenBooks (Improved Version)

set -e

echo "🚀 OpenBooks Improved - Quick Start"
echo "===================================="
echo ""

# Check if .env file exists for credentials
if [ ! -f .env ]; then
    echo "📝 Creating .env file for authentication..."
    cat > .env << EOF
# OpenBooks Authentication
AUTH_USER=admin
AUTH_PASS=changeme123

# Optional: Base path for reverse proxy
# BASE_PATH=/openbooks/
EOF
    echo "✅ Created .env file with default credentials"
    echo "⚠️  Please edit .env to change the default password!"
    echo ""
fi

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t openbooks-improved:latest .

echo ""
echo "✅ Build complete!"
echo ""
echo "📚 Starting OpenBooks on port 8383..."
echo ""

# Run the container
docker run -d \
    --name openbooks-improved \
    -p 8383:80 \
    -v "$(pwd)/books:/books" \
    --env-file .env \
    --restart unless-stopped \
    openbooks-improved:latest

echo ""
echo "✅ OpenBooks is now running!"
echo ""
echo "🌐 Access at: http://localhost:8383"
echo "👤 Username: $(grep AUTH_USER .env | cut -d'=' -f2)"
echo "🔑 Password: $(grep AUTH_PASS .env | cut -d'=' -f2)"
echo ""
echo "📂 Books will be saved to: $(pwd)/books"
echo ""
echo "📋 Useful commands:"
echo "   docker logs -f openbooks-improved    # View logs"
echo "   docker stop openbooks-improved       # Stop container"
echo "   docker start openbooks-improved      # Start container"
echo "   docker rm -f openbooks-improved      # Remove container"
echo ""
echo "🔐 Security: Remember to change the password in .env!"
