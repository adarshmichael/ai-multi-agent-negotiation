# NegoSim Backend — Deployment Guide

This guide covers everything you need to deploy the NegoSim backend to production and connect your frontend to it.

## 1. Create a Free MongoDB Database (Atlas)

Since frontend `localStorage` is insecure and doesn't sync across devices, we use MongoDB to store all user accounts securely.

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and sign up for a free account.
2. Create a **New Cluster** and select the **M0 Free** tier.
3. In the "Security Quickstart", create a database user:
   - Provide a strong username and password. **Save this password!**
4. Set up Network Access:
   - Click **Network Access** in the left sidebar.
   - Click **Add IP Address**.
   - Select **Allow Access From Anywhere** (`0.0.0.0/0`). This is required because free-tier hosts like Render change IPs constantly. Your strong database password protects your data.
5. Get your Connection String:
   - Go to **Databases** -> **Connect** -> **Connect your application**.
   - Copy the connection string. It looks like:
     `mongodb+srv://<username>:<password>@cluster0...mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
   - Replace `<password>` with the password you created in Step 3.

---

## 2. Generate a Strong JWT Secret

This secret is used to encrypt user login sessions. Do not use a simple word.

- Open a terminal and run this command:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Copy the output string. This is your `JWT_SECRET`.

---

## 3. Deploy the Backend to Render (Free)

1. Go to [Render.com](https://render.com) and create an account (you can sign in with GitHub).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository (`adarshmichael/ai-multi-agent-negotiation`).
4. Configure the Web Service:
   - **Name**: `negosim-backend` (or whatever you prefer)
   - **Root Directory**: `backend` (very important!)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add the following **Environment Variables**:
   - `MONGODB_URI`: The connection string you got from Step 1.
   - `JWT_SECRET`: The random string you generated in Step 2.
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `CLIENT_ORIGINS`: `https://adarshmichael.github.io`
   - `NODE_ENV`: `production`
6. Click **Create Web Service**. Wait 2-4 minutes for it to build and deploy.
7. Once live, copy your new backend URL from the top left (e.g., `https://negosim-backend.onrender.com`).

---

## 4. Connect the Frontend

Now that the backend is live, you need to point your frontend to it.

1. Open `js/config.js` in your project.
2. Find the line:
   ```javascript
   const PRODUCTION_API_URL = 'https://negosim-backend.onrender.com';
   ```
3. If your Render URL is different, replace it there.
4. Commit and push your code to GitHub:
   ```bash
   git add .
   git commit -m "Update API URL for production"
   git push
   ```

Your GitHub Pages frontend will now talk securely to your Render backend, and user accounts will persist in MongoDB!

## Running Locally

To run the full stack locally on your machine:
1. Copy `.env.example` to `.env` inside the `/backend` folder.
2. Fill in the `.env` values.
3. Start the backend: `cd backend && npm start`
4. Start the frontend: Use VS Code Live Server (runs on port `5501` by default). The app will automatically detect `localhost` and point to the local backend.
