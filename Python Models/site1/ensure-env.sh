#!/bin/bash

# Ensure .env exists for serverless

if [ ! -f .env ]; then
    if [ -f .env.local ]; then
        echo "📋 Creating .env from .env.local..."
        cp .env.local .env
        echo "✅ .env created"
    else
        echo "⚠️  No .env or .env.local found!"
        echo "Creating empty .env file..."
        cat > .env << 'EOF'
DATABASE_URL=
EMAILJS_PRIVATE_KEY=
EMAILJS_PUBLIC_KEY=
EMAILJS_SERVICE_ID=
EMAILJS_TEMPLATE_CONTACT=
EMAILJS_TEMPLATE_FEEDBACK=
EMAILJS_USER_ID=
EOF
        echo "✅ Empty .env created. Please add your environment variables."
    fi
else
    echo "✅ .env file exists"
fi
