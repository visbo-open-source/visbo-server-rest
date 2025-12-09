FROM node:20-alpine

WORKDIR /app

# Install dependencies as root
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application source
COPY . .

# Create and use non-root user for running the app
RUN addgroup -S visbo && adduser -S visbo -G visbo \
  && chown -R visbo:visbo /app
USER visbo

EXPOSE 3484
CMD ["node", "./bin/www"]