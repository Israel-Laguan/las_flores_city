FROM node:18-alpine

WORKDIR /app

# Copy all package files
COPY admin/package*.json ./
COPY shared/package*.json ../shared/

# Install shared dependencies first (needs tsc)
RUN cd ../shared && npm install

# Install admin dependencies
RUN npm install

# Copy source code
COPY admin/ .
COPY shared/ ../shared/

# Build shared types
RUN cd ../shared && npm run build

# Build admin panel
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "dev"]
