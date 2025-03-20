FROM node:23
WORKDIR /app
copy package*.json ./
run npm install
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
