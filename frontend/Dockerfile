# Stage 1: Build Frontend
FROM node:20-alpine as build

WORKDIR /app

# Install dependencies (use cache for package.json)
COPY package*.json ./
RUN npm install --silent

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx for production performance
FROM nginx:stable-alpine

# Copy built app to nginx share dir
COPY --from=build /app/build /usr/share/nginx/html

# Replace default config with custom (handles React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
