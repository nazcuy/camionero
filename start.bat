start "GraphHopper" cmd /k "cd services\graphhopper && java -jar graphhopper-web-8.0.jar server config.yml"
start "Backend" cmd /k "cd apps\backend && .\mvnw.cmd spring-boot:run"
start "Frontend" cmd /k "pnpm dev:web"