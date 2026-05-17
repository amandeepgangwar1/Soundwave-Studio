# Deployment Guide: Music Website (Render + Vercel + MongoDB Atlas)

This guide walks you through deploying the Soundwave Studio music website to production using:
- **Backend**: Render
- **Frontend**: Vercel  
- **Database**: MongoDB Atlas

---

## Prerequisites

- GitHub account with the project repository
- Render account (https://render.com)
- Vercel account (https://vercel.com)
- MongoDB Atlas account (https://www.mongodb.com/cloud/atlas)

---

## Step 1: Set Up MongoDB Atlas

### 1.1 Create a MongoDB Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign in or create an account
3. Create a new project:
   - Click "Create" button
   - Name your project (e.g., "Soundwave Studio")
   - Click "Create Project"

4. Create a cluster:
   - Click "Create a Deployment"
   - Choose "M0" (free tier)
   - Select your preferred cloud provider (AWS, Google Cloud, or Azure)
   - Select a region closest to your users
   - Click "Create Deployment"

### 1.2 Create Database User & Get Connection String

1. In the Clusters view, click on your cluster
2. Go to "Database Access" tab:
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Set username and password (save these!)
   - Click "Add User"

3. Go to "Network Access" tab:
   - Click "Add IP Address"
   - Choose "Allow access from anywhere" (0.0.0.0/0) for development
   - Click "Confirm"

4. Get the connection string:
   - In the cluster overview, click "Connect"
   - Choose "Drivers"
   - Copy the connection string
   - Replace `<username>`, `<password>` with your credentials
   - Replace `<mydatabase>` with `soundwave`
   - The URL should look like:
     ```
     mongodb+srv://username:password@cluster.mongodb.net/soundwave?retryWrites=true&w=majority
     ```

---

## Step 2: Deploy Backend to Render

### 2.1 Push Code to GitHub

1. Initialize git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Soundwave Studio"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/music-website.git
   git push -u origin main
   ```

### 2.2 Connect Render to GitHub

1. Go to [Render.com](https://render.com)
2. Sign in or create an account
3. Click "New +" → "Web Service"
4. Connect your GitHub account and select the repository
5. Configure the service:
   - **Name**: `soundwave-studio`
   - **Environment**: `Node`
   - **Build Command**: `npm --prefix backend install`
   - **Start Command**: `npm --prefix backend start`
   - **Plan**: Free (or paid for production)

### 2.3 Set Environment Variables in Render

1. In the Render dashboard, go to your service
2. Click "Environment" tab
3. Add the following environment variables:
   ```
   NODE_ENV = production
   PORT = 10000
   HOST = 0.0.0.0
   PUBLIC_URL = https://soundwave-studio.onrender.com
   FRONTEND_URL = https://your-vercel-domain.vercel.app
   MONGO_URI = mongodb+srv://username:password@cluster.mongodb.net/soundwave?retryWrites=true&w=majority
   RAZORPAY_KEY_ID = (optional - leave empty if not using)
   RAZORPAY_KEY_SECRET = (optional - leave empty if not using)
   OPENAI_API_KEY = (optional - leave empty if not using)
   ```

4. Click "Save Changes"
5. The deployment will start automatically
6. Wait for it to complete (check logs for any errors)
7. Your backend URL will be something like: `https://soundwave-studio.onrender.com`

### 2.4 Verify Backend Deployment

1. Visit `https://soundwave-studio.onrender.com` in your browser
2. You should see the frontend or an HTML page
3. Try accessing an API endpoint: `https://soundwave-studio.onrender.com/api/playlists`
4. If it returns JSON, the backend is working!

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Connect Vercel to GitHub

1. Go to [Vercel.com](https://vercel.com)
2. Sign in or create an account
3. Click "Add New..." → "Project"
4. Select your GitHub repository
5. Configure project settings:
   - **Framework**: Other (since it's static HTML/JS)
   - **Root Directory**: `.` (root)
   - **Build Command**: `echo "Frontend only - no build needed"`
   - **Output Directory**: `frontend`

### 3.2 Set Environment Variables in Vercel

⚠️ **Important**: Update `vercel.json` with your Render backend URL before deploying!

1. In Vercel dashboard, go to your project
2. Settings → Environment Variables
3. Add:
   ```
   NEXT_PUBLIC_API_URL = https://soundwave-studio.onrender.com
   ```

### 3.3 Update Vercel Configuration

Update your `vercel.json` to use your actual Render URL:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://soundwave-studio.onrender.com/api/:path*"
    },
    {
      "source": "/:path((?!.*\\.).*)",
      "destination": "/index.html"
    }
  ]
}
```

Replace `https://soundwave-studio.onrender.com` with your actual Render backend URL.

### 3.4 Deploy

1. Vercel will auto-deploy when you push changes to GitHub
2. Monitor the deployment in the Vercel dashboard
3. Once complete, your frontend will be available at: `https://your-project.vercel.app`

---

## Step 4: Update CORS and URLs

### 4.1 Update Backend CORS Settings

In [Render dashboard](https://render.com):

1. Go to your `soundwave-studio` service
2. Environment variables → Update `FRONTEND_URL`:
   ```
   FRONTEND_URL = https://your-vercel-domain.vercel.app
   ```

3. Trigger a redeploy (push a change to GitHub or click "Deploy" in Render)

### 4.2 Verify Cross-Origin Requests

1. Open your Vercel frontend in browser
2. Open browser DevTools (F12) → Console
3. Try logging in or accessing an API feature
4. Check for CORS errors in the console
5. If you see CORS errors, verify:
   - Backend `FRONTEND_URL` environment variable is set correctly
   - Frontend `vercel.json` rewrites point to correct backend URL

---

## Step 5: Test the Deployment

### 5.1 Basic Tests

- [ ] Frontend loads without errors: `https://your-vercel-domain.vercel.app`
- [ ] Can see the home page with music/playlists
- [ ] API calls work from browser console:
  ```javascript
  fetch('https://your-vercel-domain.vercel.app/api/playlists')
    .then(r => r.json())
    .then(console.log)
  ```

### 5.2 Feature Tests

- [ ] User authentication (sign up, login)
- [ ] Browse playlists and songs
- [ ] Play music (if music files are configured)
- [ ] Create/manage playlists
- [ ] Like/favorite songs
- [ ] Search functionality

### 5.3 Database Tests

To verify MongoDB is working:

1. In MongoDB Atlas, go to your cluster
2. Click "Collections"
3. You should see databases created: `soundwave`
4. Collections should include: `users`, `playlists`, `sessions`, etc.

---

## Troubleshooting

### Frontend Shows 404 or "Cannot GET /"

**Solution**: Check that `vercel.json` is configured correctly and `outputDirectory` is set to `frontend`.

### CORS Errors

**Solution**: 
- Verify `FRONTEND_URL` is set in Render environment variables
- Check that `vercel.json` rewrites are correct
- Browser console should show which origin was rejected

### Cannot Connect to MongoDB

**Solution**:
- Verify `MONGO_URI` in Render environment variables
- Check MongoDB Atlas IP whitelist includes `0.0.0.0/0`
- Test connection string in MongoDB Compass (desktop tool)
- Check cluster is running in MongoDB Atlas dashboard

### 502 Bad Gateway on Render

**Solution**:
- Check Render service logs for errors
- Verify all required environment variables are set
- Check that Node version requirement (>=20) is met
- Restart the service from Render dashboard

### Long Initial Startup

**Solution**: Free tier instances on Render go to sleep after 15 minutes of inactivity. First request may take 30 seconds to spin up. This is normal.

---

## Monitoring & Maintenance

### View Logs

**Render**:
- Dashboard → Service → Logs tab

**Vercel**:
- Dashboard → Project → Deployments → Logs tab

### Update Environment Variables

1. Make changes in the service/project dashboard
2. Changes take effect automatically or after redeploy
3. To redeploy: push a commit to GitHub

### Upgrade from Free Tier

When you're ready to scale:

1. **Render**: Upgrade to Starter or Pro plan in service settings
2. **Vercel**: Upgrade account plan in billing settings
3. **MongoDB Atlas**: Upgrade to M2 or higher in cluster settings

---

## Useful Commands

```bash
# Local testing
npm --prefix backend install
npm --prefix backend start

# Seed database (if needed)
npm --prefix backend run seed

# Monitor logs
# In Render: Dashboard → Logs
# In Vercel: Dashboard → Deployments → Logs

# Check backend health
curl https://soundwave-studio.onrender.com/

# Check API
curl https://soundwave-studio.onrender.com/api/playlists
```

---

## Support

- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **MongoDB Atlas Docs**: https://docs.atlas.mongodb.com
- **Express.js**: https://expressjs.com

---

## Summary

Your deployment architecture:

```
[Your Vercel Frontend] ↔ CORS ↔ [Your Render Backend] ↔ [MongoDB Atlas]
   (Static HTML/JS)                  (Node.js Express)    (Database)
```

- Frontend hosted on Vercel (CDN-delivered, always fast)
- Backend hosted on Render (Node.js application server)
- Database on MongoDB Atlas (managed cloud database)
- All connected via HTTPS with proper CORS configuration

🚀 Your music website is now live!
