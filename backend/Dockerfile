FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/

RUN npm run build || npx tsc

EXPOSE 3000

CMD ["node", "dist/server.js"]
