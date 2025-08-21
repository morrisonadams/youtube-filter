# Use Node.js 18 for building the Next.js application
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build the application
COPY . .
RUN npm run build

# Production image
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy build artifacts and dependencies from builder stage
COPY --from=builder /app .

EXPOSE 3000
CMD ["npm", "start"]
