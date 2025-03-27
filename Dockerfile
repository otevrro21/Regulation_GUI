FROM nginx:alpine

# Copy HTML, CSS, JS and other web files but not Dockerfile and docker-compose.yml
COPY *.html *.css *.js /usr/share/nginx/html/

EXPOSE 35543

# Configure nginx to listen on port 35543
RUN sed -i 's/listen\s*80;/listen 35543;/g' /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]