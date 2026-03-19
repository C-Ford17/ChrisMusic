FROM node:20-slim

# Install system dependencies (Linux level)
# ffmpeg is essential for sound processing, and python3 for yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp directly on the server
# We put it in /usr/local/bin which the API now points to.
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Build the Next.js application for production
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Start ChrisMusic server in production mode
CMD ["npm", "start"]
