@echo off
cd /d "%~dp0"

set "GRAPHHOPPER_DIR=services\graphhopper"
set "GRAPHHOPPER_JAR=%GRAPHHOPPER_DIR%\graphhopper-web-8.0.jar"
set "GRAPHHOPPER_DOWNLOAD=%GRAPHHOPPER_JAR%.part"
set "GRAPHHOPPER_URL=https://repo.maven.apache.org/maven2/com/graphhopper/graphhopper-web/8.0/graphhopper-web-8.0.jar"
set "OSM_FILE=%GRAPHHOPPER_DIR%\argentina-260728.osm.pbf"

if not exist "%GRAPHHOPPER_JAR%" (
    echo Descargando GraphHopper 8.0...
    curl.exe --fail --location --output "%GRAPHHOPPER_DOWNLOAD%" "%GRAPHHOPPER_URL%"
    if errorlevel 1 (
        if exist "%GRAPHHOPPER_DOWNLOAD%" del "%GRAPHHOPPER_DOWNLOAD%"
        echo No se pudo descargar GraphHopper. Verifica tu conexion a internet.
        pause
        exit /b 1
    )
    move /y "%GRAPHHOPPER_DOWNLOAD%" "%GRAPHHOPPER_JAR%" >nul
    if errorlevel 1 (
        echo No se pudo guardar el archivo de GraphHopper.
        pause
        exit /b 1
    )
)

if not exist "%OSM_FILE%" (
    echo Falta el mapa de Argentina: "%OSM_FILE%"
    echo Descarga o copia el archivo OSM PBF antes de iniciar GraphHopper.
    pause
    exit /b 1
)

start "GraphHopper" cmd /k "cd services\graphhopper && java -jar graphhopper-web-8.0.jar server config.yml"
start "Backend" cmd /k "cd apps\backend && .\mvnw.cmd spring-boot:run"
start "Frontend" cmd /k "pnpm dev:web"