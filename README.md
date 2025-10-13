# AgriAI - AI-Powered Farming Assistant PWA

AgriAI is a Progressive Web App designed to empower farmers with AI-driven tools for plant disease detection, intelligent farming advice, weather forecasting, and community support.

## Features

### MVP (Phase 1)
- **Authentication System** - Secure login and registration for farmers (integrated with backend API)
- **Dashboard** - Overview of weather, farm insights, and quick actions
- **Plant Disease Detection** - Upload plant images for AI-powered disease identification and treatment recommendations (via backend)
- **AI Chatbot Assistant** - Get instant answers to farming questions about crops, pests, irrigation, and more (via backend)
- **Weather Display** - Comprehensive weather forecasts with farming-specific insights (via backend)
- **PWA Support** - Install on mobile devices for offline access and native app experience

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: Node.js, Express, MongoDB, JWT authentication, REST API
- **State Management**: React Context API
- **Icons**: Lucide React
- **PWA**: Next.js PWA support with service workers

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm, yarn, or pnpm package manager
- MongoDB running locally or remotely

### Installation

#### 1. **Download the project**
   ```bash
   git clone https://github.com/your-username/agriai.git
   cd agriai
   ```

#### 2. **Install dependencies**
   ```bash
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

#### 3. **Configure environment variables**
- Edit `/backend/.env` for backend settings (see sample in repo)
- Optionally, create `/frontend/.env.local` for frontend API URL:
  ```
  NEXT_PUBLIC_API_URL=http://localhost:5000/api
  ```

#### 4. **Run the backend server**
   ```bash
   cd backend
   npm start
   ```

#### 5. **Run the frontend development server**
   ```bash
   cd frontend
   npm run dev
   ```

#### 6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Building for Production

```bash
# Build the frontend application
cd frontend
npm run build

# Start production server
npm run start
```

## API Integration

- The frontend communicates with the backend via REST API (`/api/*` endpoints).
- Authentication, disease detection, chatbot, and weather features use backend endpoints.
- CORS is configured for secure cross-origin requests.

## Usage Guide

### Authentication

1. **Register**: Create a new account (data stored in backend)
2. **Login**: Sign in (JWT token issued by backend)
3. **Logout**: Clears token and session

### Plant Disease Detection, AI Chatbot, Weather Dashboard

- All features send requests to backend API endpoints for real-time results.

## Project Structure

```
agriai/
├── backend/                # Express.js backend API
│   ├── routes/             # API endpoints
│   ├── models/             # MongoDB models
│   ├── middleware/         # Auth, error handling
│   └── server.js           # Main server file
├── frontend/               # Next.js frontend
│   ├── app/                # App routes
│   ├── components/         # UI components
│   ├── lib/                # API and auth context
│   └── public/             # PWA assets
```

## Environment Variables

- Backend: See `/backend/.env` for required keys (MongoDB, JWT, API keys)
- Frontend: Set `NEXT_PUBLIC_API_URL` if needed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on mobile and desktop
5. Submit a pull request

## License

MIT License

---

Built by Philip Barongo Ondieki with love for farmers ❤️