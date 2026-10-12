# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Remove unnecessary files for production
RUN rm -rf tests scripts/check-syntax.js .git .github 2>/dev/null; true

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app .

# Switch to non-root user
USER nodejs

# Expose the default port (can be overridden by PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), (res) => { if (res.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "server.js"]