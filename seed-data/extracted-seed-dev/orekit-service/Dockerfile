# Dev-friendly image that runs the Orekit REST shim
FROM gradle:8.8-jdk21
WORKDIR /app
COPY . /app
EXPOSE 8088
CMD ["gradle","run"]
