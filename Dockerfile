FROM node:22-alpine
WORKDIR /app

# Install dependencies first (better layer caching)
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source into /app
COPY backend/ ./

# Copy frontend into /frontend (server.js looks at ../frontend)
COPY frontend/ /frontend/

EXPOSE 3000
CMD ["node", "server.js"]
