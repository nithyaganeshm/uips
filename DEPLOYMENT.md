# UIPS Deployment Guide

This document outlines the steps to deploy the Unified Intelligent Proctoring System (UIPS).

## 1. Backend Deployment (Python/Flask)
Recommended Platforms: Render, Heroku, or DigitalOcean App Platform.

### Prerequisites
- A Neon PostgreSQL database instance.
- Environment variables configured on your host.

### Required Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `FLASK_ENV` | Environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host/db` |
| `SECRET_KEY` | Long random string for JWT/Sessions | `your-super-secret-key` |
| `CORS_ORIGINS` | Comma-separated allowed frontend URLs | `https://uips.netlify.app` |

### Steps
1. Push the code to a GitHub repository.
2. Connect the repository to your hosting provider.
3. Set the build command: `pip install -r requirements.txt`
4. Set the start command: `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app`

---

## 2. Frontend Deployment (React/Vite)
Recommended Platforms: Netlify, Vercel, or GitHub Pages.

### Prerequisites
- The backend must be deployed first to get the `VITE_API_URL`.

### Required Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | The URL of your deployed backend | `https://uips-api.onrender.com` |

### Steps
1. Connect your repository to Netlify/Vercel.
2. Set the build command: `npm run build`
3. Set the publish directory: `dist`
4. Add the `VITE_API_URL` environment variable in the site settings.

---

## 3. Important Considerations
- **MediaPipe:** Ensure your backend environment has the necessary system libraries for OpenCV/MediaPipe (Render's default Python environment usually works fine).
- **Socket.io:** Ensure your frontend client is configured to connect to the correct backend URL. The current setup automatically uses the `API_BASE` for sockets as well.
