FROM node:20-alpine
WORKDIR /app
COPY cloud-server.js .
RUN npm install ws
EXPOSE 9763
CMD ["node", "cloud-server.js"]