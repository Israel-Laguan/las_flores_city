FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY admin/package*.json ./admin/

RUN npm ci

COPY .eslintrc.json ./
COPY tsconfig.json ./
COPY client/ ./client/
COPY admin/ ./admin/
COPY server/ ./server/
COPY shared/ ./shared/

RUN npm run build --workspace=shared && npm run build --workspace=server

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=server"]
