FROM node:16.17-alpine 
 
WORKDIR /
 
COPY . . 
RUN npm install


EXPOSE 3484
CMD ["node", "./bin/www"]