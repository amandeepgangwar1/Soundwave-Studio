#!/bin/bash

# Production Deployment Verification Script
# Run this before deploying to ensure everything is configured correctly

echo "🔍 Checking production deployment setup..."
echo ""

# Check for .env file (should not be committed)
if [ -f ".env" ]; then
    echo "⚠️  WARNING: .env file exists - make sure it's in .gitignore"
fi

# Check for .gitignore
if [ -f ".gitignore" ]; then
    echo "✅ .gitignore exists"
    if grep -q ".env" .gitignore; then
        echo "✅ .env is in .gitignore"
    else
        echo "⚠️  .env not in .gitignore - add it!"
    fi
else
    echo "⚠️  No .gitignore file - create one!"
fi

# Check for render.yaml
if [ -f "render.yaml" ]; then
    echo "✅ render.yaml exists"
    if grep -q "MONGO_URI" render.yaml; then
        echo "✅ MONGO_URI is in render.yaml"
    else
        echo "⚠️  MONGO_URI not configured in render.yaml"
    fi
else
    echo "❌ render.yaml missing!"
fi

# Check for vercel.json
if [ -f "vercel.json" ]; then
    echo "✅ vercel.json exists"
    if grep -q "rewrites" vercel.json; then
        echo "✅ API rewrites configured in vercel.json"
    else
        echo "⚠️  API rewrites not configured in vercel.json"
    fi
else
    echo "❌ vercel.json missing!"
fi

# Check backend dependencies
if [ -f "backend/package.json" ]; then
    echo "✅ backend/package.json exists"
    if grep -q "cors" backend/package.json; then
        echo "✅ CORS package installed"
    else
        echo "⚠️  CORS package not installed - run: npm --prefix backend install"
    fi
else
    echo "❌ backend/package.json missing!"
fi

# Check for deployment docs
if [ -f "DEPLOYMENT.md" ]; then
    echo "✅ DEPLOYMENT.md exists"
else
    echo "⚠️  DEPLOYMENT.md missing"
fi

if [ -f "QUICK_DEPLOY.md" ]; then
    echo "✅ QUICK_DEPLOY.md exists"
else
    echo "⚠️  QUICK_DEPLOY.md missing"
fi

echo ""
echo "📋 Pre-Deployment Checklist:"
echo "  [ ] Code pushed to GitHub"
echo "  [ ] MongoDB Atlas cluster created"
echo "  [ ] All environment variables configured in Render/Vercel dashboards"
echo "  [ ] vercel.json updated with correct Render backend URL"
echo "  [ ] render.yaml has all required environment variables"
echo ""
echo "✨ Once all items are checked, your deployment is ready!"
