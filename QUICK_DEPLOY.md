# Quick Start: Deploy to Production

## 📋 Pre-Deployment Checklist

- [ ] Code committed to GitHub
- [ ] All sensitive data removed from repository (API keys, passwords)
- [ ] `.env.example` reviewed and accurate
- [ ] `render.yaml` configured with service name and build commands
- [ ] `vercel.json` configured with rewrites

---

## 🚀 Deploy in 5 Minutes

### 1. MongoDB Atlas (2 min)
- [ ] Create cluster (M0 free tier)
- [ ] Add database user (username/password)
- [ ] Add IP 0.0.0.0/0 to Network Access
- [ ] Copy connection string
- [ ] **Save**: `MONGO_URI`

### 2. Render Backend (1 min)
- [ ] Go to render.com → Create Web Service
- [ ] Connect GitHub repository
- [ ] Build: `npm --prefix backend install`
- [ ] Start: `npm --prefix backend start`
- [ ] Add environment variables (use render.yaml)
- [ ] **Save**: Backend URL (e.g., `https://soundwave-studio.onrender.com`)

### 3. Vercel Frontend (2 min)
- [ ] Go to vercel.com → Add Project
- [ ] Select GitHub repository
- [ ] Root Directory: `.`
- [ ] Output Directory: `frontend`
- [ ] Deploy
- [ ] **Save**: Frontend URL (e.g., `https://your-project.vercel.app`)

### 4. Update URLs
- [ ] In Render: Set `FRONTEND_URL` to Vercel URL
- [ ] In Vercel: Update `vercel.json` with Render backend URL
- [ ] Trigger redeploy

### 5. Test
- [ ] Visit Vercel URL in browser
- [ ] Check browser console (F12) for errors
- [ ] Try signing up/logging in
- [ ] Browse playlists and songs

---

## 🔗 Important URLs

After deployment, you'll have:

```
Frontend:  https://your-project.vercel.app
Backend:   https://soundwave-studio.onrender.com
Database:  MongoDB Atlas (cloud)
```

All communicate via HTTPS with CORS enabled.

---

## 📝 Environment Variables

**Render (Backend)**:
```
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
PUBLIC_URL=https://soundwave-studio.onrender.com
FRONTEND_URL=https://your-vercel-url.vercel.app
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/soundwave
```

**Vercel (Frontend)**:
- No environment variables needed (uses Vercel rewrites)

---

## ❓ Common Issues

| Issue | Solution |
|-------|----------|
| 404 Not Found | Check `vercel.json` rewrites and `outputDirectory: frontend` |
| CORS Error | Verify `FRONTEND_URL` in Render, update `vercel.json` with backend URL |
| Cannot Connect DB | Check MongoDB Atlas IP whitelist, verify `MONGO_URI` |
| 502 Bad Gateway | Check Render logs, verify environment variables, restart service |
| Slow Startup | Free tier takes 30s on first request - normal |

---

## 📞 Support Links

- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs) 
- [MongoDB Atlas Guide](https://docs.atlas.mongodb.com)

---

**Next Step**: Follow the detailed [DEPLOYMENT.md](./DEPLOYMENT.md) guide for comprehensive instructions.
