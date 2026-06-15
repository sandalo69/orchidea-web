FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY app/package*.json ./
RUN npm ci --only=production

# Copy application code
COPY app/ .

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "server.js"]
