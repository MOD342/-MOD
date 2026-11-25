FROM node:20-slim

WORKDIR /app

# Copy package manifests and install all dependencies cleanly for production build
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Build frontend dist/, compiled Node server dist/server.cjs, and clean dev dependencies if desired
RUN npm run build

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "dist/server.cjs"]
