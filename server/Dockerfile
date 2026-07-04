FROM node:20-alpine

WORKDIR /app

# Copy package files from project root
COPY package.json ./package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY client/package.json ./client/package.json
COPY admin/package.json ./admin/package.json

# Install dependencies FIRST to create package-lock.json
RUN npm install --no-save

# Copy source files
COPY .eslintrc.json ./.eslintrc.json
COPY tsconfig.json ./tsconfig.json
COPY client ./client
COPY admin ./admin
COPY server ./server
COPY shared ./shared
COPY docs ./docs

# Build workspaces
RUN npm run build --workspace=shared && npm run build --workspace=server

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=server"]
