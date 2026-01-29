
FROM node:20-slim
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm i -g yarn && yarn install
RUN yarn build
EXPOSE 3000
CMD ["node","dist/index.js"]
