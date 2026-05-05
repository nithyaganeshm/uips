# UIPS - University Integrity Proctoring System

A Flask-based intelligent online exam proctoring system that monitors students during examinations using computer vision, audio analysis, and behavior pattern detection in real-time.

## Features

- **Real-time Monitoring**: Live webcam and audio monitoring during exams
- **Suspicion Detection**: AI-powered detection of:
  - Face absence/multiple faces
  - Gaze deviation
  - Audio anomalies
  - Typing patterns
  - Posture alerts
- **Risk Scoring**: Automated suspicion index calculation (0-100)
- **Live Dashboard**: Real-time updates via WebSocket for invigilators
- **Detailed Reports**: PDF/HTML reports with session analytics
- **Multi-user Roles**: Admin, Invigilator, and Student roles

## Tech Stack

### Frontend

- **Framework**: React 19
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS 3
- **Routing**: React Router DOM 7
- **HTTP Client**: Axios
- **Real-time**: Socket.IO Client
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Auth**: JWT
- **Environment**: Vite Environment Variables (VITE_API_URL)

### Backend

- **Framework**: Flask, Flask-SocketIO, Flask-Limiter
- **Database**: SQLAlchemy (Neon PostgreSQL)
- **ML/AI**: MediaPipe, PyTorch, OpenCV, Librosa, Scikit-learn
- **Real-time**: Socket.IO for live updates
- **Deployment**: Gunicorn, Render-compatible

## Project Structure

```
uips/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── config.py              # Configuration settings
│   ├── requirements.txt       # Python dependencies
│   ├── blueprints/           # Route handlers
│   │   ├── auth/              # Authentication
│   │   ├── exams/             # Exam management
│   │   ├── session/           # Session handling
│   │   ├── monitor/           # Monitoring endpoints
│   │   └── reports/           # Report generation
│   ├── models/                # Database models
│   │   ├── user.py            # User model
│   │   ├── exam.py            # Exam model
│   │   ├── session.py          # Exam session model
│   │   ├── event.py            # Suspicion events
│   │   └── media.py            # Media chunks
│   ├── database/              # Database utilities
│   │   └── db.py              # SQLAlchemy setup
│   ├── ml/                   # Machine learning modules
│   │   ├── visual_encoder.py  # Face detection
│   │   ├── audio_encoder.py   # Audio analysis
│   │   ├── behavior_encoder.py# Behavior patterns
│   │   ├── transformer.py     # Transformer model
│   │   ├── inference.py       # ML inference
│   │   └── training_data/     # Training datasets
│   ├── sockets/               # WebSocket handlers
│   │   └── events.py          # Real-time events
│   ├── uploads/               # Uploaded media storage
│   ├── reports/               # Generated reports
│   └── Procfile               # Deployment config
├── .env.example               # Environment template
└── README.md                  # This file
```

## Prerequisites

- Python 3.9+
- PostgreSQL (production) or SQLite (development)
- FFmpeg (for audio processing)

## Installation

1. **Clone the repository**

   ```bash
   cd uips
   ```

2. **Create virtual environment**

   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # Linux/Mac
   ```

3. **Install dependencies**

   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Configure environment variables**

   ```bash
   cp backend/.env.example backend/.env
   ```

5. **Edit `.env` with your settings**
   ```env
   FLASK_ENV=development
   SECRET_KEY=your-secret-key
   DATABASE_URL=postgresql://user:password@ep-your-host.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

## Running the Application

### Development Mode

```bash
cd backend
python app.py
```

Server runs at `http://localhost:5000`

### Production Mode

```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## API Endpoints

### Authentication

| Method | Endpoint             | Description       |
| ------ | -------------------- | ----------------- |
| POST   | `/api/auth/login`    | User login        |
| POST   | `/api/auth/register` | User registration |
| POST   | `/api/auth/logout`   | User logout       |

### Exams

| Method | Endpoint          | Description      |
| ------ | ----------------- | ---------------- |
| GET    | `/api/exams`      | List all exams   |
| POST   | `/api/exams`      | Create new exam  |
| GET    | `/api/exams/<id>` | Get exam details |
| PUT    | `/api/exams/<id>` | Update exam      |
| DELETE | `/api/exams/<id>` | Delete exam      |

### Sessions

| Method | Endpoint              | Description        |
| ------ | --------------------- | ------------------ |
| POST   | `/api/session/start`  | Start exam session |
| POST   | `/api/session/end`    | End exam session   |
| POST   | `/api/session/upload` | Upload media chunk |

### Monitoring

| Method | Endpoint                    | Description         |
| ------ | --------------------------- | ------------------- |
| GET    | `/api/monitor/sessions`     | Get active sessions |
| GET    | `/api/monitor/session/<id>` | Get session details |
| GET    | `/api/monitor/alerts`       | Get recent alerts   |

### Reports

| Method | Endpoint                    | Description             |
| ------ | --------------------------- | ----------------------- |
| GET    | `/api/reports/session/<id>` | Generate session report |
| GET    | `/api/reports/export/<id>`  | Export report as PDF    |

## WebSocket Events

### Client → Server

| Event               | Payload        | Description                |
| ------------------- | -------------- | -------------------------- |
| `join_session`      | `{session_id}` | Join a monitoring session  |
| `leave_session`     | `{session_id}` | Leave a monitoring session |
| `join_invigilators` | -              | Join invigilator room      |

### Server → Client

| Event           | Payload                                      | Description                |
| --------------- | -------------------------------------------- | -------------------------- |
| `score_update`  | `{session_id, suspicion_index}`              | Real-time score update     |
| `alert`         | `{student_name, type, severity, session_id}` | New suspicion alert        |
| `session_ended` | `{session_id}`                               | Session ended notification |

## Configuration

### Environment Variables

| Variable             | Description                | Default             |
| -------------------- | -------------------------- | ------------------- |
| `FLASK_ENV`          | Environment mode           | `development`       |
| `SECRET_KEY`         | Application secret key     | -                   |
| `DATABASE_URL`       | Database connection string | -                   |
| `CORS_ORIGINS`       | Allowed frontend origins   | `http://localhost:5173` |
| `PORT`               | Server port                | `5000`              |
| `VITE_API_URL`       | Frontend API target URL    | `http://localhost:5000` |
| `MAX_CONTENT_LENGTH` | Max upload size (bytes)    | 52428800 (50MB)     |

### Database Support
 
- **Development**: Neon PostgreSQL (Cloud)
- **Production**: Neon PostgreSQL (Cloud)

## User Roles

| Role            | Permissions                                           |
| --------------- | ----------------------------------------------------- |
| **Admin**       | Full system access, manage users, view all sessions   |
| **Invigilator** | Monitor active sessions, view reports, receive alerts |
| **Student**     | Join exam sessions, submit responses                  |

## Suspicion Scoring

The system calculates a suspicion index (0-100) based on:

- **Face Detection**: -20 for absent, +15 for multiple faces
- **Gaze Deviation**: +10 for looking away
- **Audio Anomaly**: +20 for suspicious sounds
- **Typing Patterns**: +15 for abnormal patterns
- **Posture Alerts**: +10 for unusual posture

Risk levels:

- **Low**: 0-30 (Safe)
- **Medium**: 31-70 (Caution - potential looking away or minor audio)
- **High**: 71-100 (Immediate concern - face absence or significant movement)

## ML Models

The system uses ensemble ML models:

1. **Visual Encoder**: Face detection and landmark analysis using **MediaPipe Tasks**. Includes geometric sanity checks (eye/nose/mouth orientation) and proximity detection.
2. **Audio Encoder**: Audio anomaly detection with Librosa
3. **Behavior Encoder**: Typing and posture analysis
4. **Transformer**: Multi-modal fusion for final scoring

## Deployment

### Render.com

```bash
# Set environment variables in Render dashboard:
FLASK_ENV=production
SECRET_KEY=<your-secret-key>
DATABASE_URL=<postgresql-connection-string>
```

The `backend/Procfile` is configured for Render deployment. 

For detailed setup instructions, see the [DEPLOYMENT.md](./DEPLOYMENT.md) guide.

## Development

### Running Tests

```bash
cd backend
pytest  # If pytest is configured
```

### Code Style

- Follow PEP 8 guidelines
- Use type hints where applicable
- Write docstrings for public functions

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---
Created by **Nithyaganesh**
