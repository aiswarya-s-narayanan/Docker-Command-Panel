# Base Node.js image
FROM node:20-alpine

# Install Docker CLI so the container can execute docker commands
RUN apk add --no-cache docker-cli

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY server.js ./
COPY public/ ./public/

# Expose web application port
EXPOSE 3030

# Copy SSL files from the ssl folder to the working directory in the container
# COPY ssl/fullchain.pem /app/fullchain.pem
# COPY ssl/privkey.pem /app/privkey.pem

# Start server
CMD ["node", "server.js"]
