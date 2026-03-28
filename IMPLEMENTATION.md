# Scenario Planning Application

This is the implementation of the Interactive Scenario Planning Web Application based on the specification in README.md.

## Quick Start

1. Ensure Docker and Docker Compose are installed.

2. Start the services:
   ```bash
   docker-compose -f docker/docker-compose.yml up -d
   ```

3. Set up the database:
   ```bash
   psql -h localhost -U user -d scenario_planning -f database/schema.sql
   ```

4. Start the backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

5. Start the frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

6. Access the application at http://localhost:3000

## Features Implemented (MVP)

- User authentication (login/register)
- Scenario listing
- Basic decision submission
- Real-time updates via Socket.io
- PostgreSQL database with defined schema
- Docker containerization

## Next Steps

Refer to the development roadmap in README.md for Phase 2-4 implementation.