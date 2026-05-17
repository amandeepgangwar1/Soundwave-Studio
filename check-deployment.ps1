# Production Deployment Verification Script (Windows)
# Run this before deploying to ensure everything is configured correctly

Write-Host "🔍 Checking production deployment setup..." -ForegroundColor Cyan
Write-Host ""

# Check for .env file (should not be committed)
if (Test-Path ".env") {
    Write-Host "⚠️  WARNING: .env file exists - make sure it's in .gitignore" -ForegroundColor Yellow
}

# Check for .gitignore
if (Test-Path ".gitignore") {
    Write-Host "✅ .gitignore exists" -ForegroundColor Green
    $gitignoreContent = Get-Content ".gitignore" -Raw
    if ($gitignoreContent -like "*.env*") {
        Write-Host "✅ .env is in .gitignore" -ForegroundColor Green
    } else {
        Write-Host "⚠️  .env not in .gitignore - add it!" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  No .gitignore file - create one!" -ForegroundColor Yellow
}

# Check for render.yaml
if (Test-Path "render.yaml") {
    Write-Host "✅ render.yaml exists" -ForegroundColor Green
    $renderContent = Get-Content "render.yaml" -Raw
    if ($renderContent -like "*MONGO_URI*") {
        Write-Host "✅ MONGO_URI is in render.yaml" -ForegroundColor Green
    } else {
        Write-Host "⚠️  MONGO_URI not configured in render.yaml" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ render.yaml missing!" -ForegroundColor Red
}

# Check for vercel.json
if (Test-Path "vercel.json") {
    Write-Host "✅ vercel.json exists" -ForegroundColor Green
    $vercelContent = Get-Content "vercel.json" -Raw
    if ($vercelContent -like "*rewrites*") {
        Write-Host "✅ API rewrites configured in vercel.json" -ForegroundColor Green
    } else {
        Write-Host "⚠️  API rewrites not configured in vercel.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ vercel.json missing!" -ForegroundColor Red
}

# Check backend dependencies
if (Test-Path "backend/package.json") {
    Write-Host "✅ backend/package.json exists" -ForegroundColor Green
    $packageContent = Get-Content "backend/package.json" -Raw
    if ($packageContent -like "*cors*") {
        Write-Host "✅ CORS package installed" -ForegroundColor Green
    } else {
        Write-Host "⚠️  CORS package not installed - run: npm --prefix backend install" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ backend/package.json missing!" -ForegroundColor Red
}

# Check for deployment docs
if (Test-Path "DEPLOYMENT.md") {
    Write-Host "✅ DEPLOYMENT.md exists" -ForegroundColor Green
} else {
    Write-Host "⚠️  DEPLOYMENT.md missing" -ForegroundColor Yellow
}

if (Test-Path "QUICK_DEPLOY.md") {
    Write-Host "✅ QUICK_DEPLOY.md exists" -ForegroundColor Green
} else {
    Write-Host "⚠️  QUICK_DEPLOY.md missing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Pre-Deployment Checklist:" -ForegroundColor Cyan
Write-Host "  [ ] Code pushed to GitHub"
Write-Host "  [ ] MongoDB Atlas cluster created"
Write-Host "  [ ] All environment variables configured in Render/Vercel dashboards"
Write-Host "  [ ] vercel.json updated with correct Render backend URL"
Write-Host "  [ ] render.yaml has all required environment variables"
Write-Host ""
Write-Host "✨ Once all items are checked, your deployment is ready!" -ForegroundColor Green
