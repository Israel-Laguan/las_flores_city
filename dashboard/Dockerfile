FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY dashboard/package*.json ./dashboard/
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm ci

COPY .eslintrc.json ./
COPY tsconfig.json ./
COPY client/ ./client/
COPY dashboard/ ./dashboard/
COPY server/ ./server/
COPY shared/ ./shared/

RUN npm run build --workspace=shared && npm run build --workspace=dashboard

EXPOSE 3000

# Copy startup script
COPY dashboard/start.sh /app/dashboard/start.sh
RUN chmod +x /app/dashboard/start.sh

# For development: use npm run dev
# For production: use start.sh which resolves secrets before starting
CMD ["npm", "run", "dev", "--workspace=dashboard"]
