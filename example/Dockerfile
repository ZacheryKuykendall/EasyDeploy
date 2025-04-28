FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Pass build-time arguments
ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

EXPOSE 8080

CMD ["npm", "start"] 