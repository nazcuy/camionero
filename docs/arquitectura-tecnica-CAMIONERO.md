# Arquitectura técnica — App de navegación para transporte pesado (Argentina)

> Waze para camiones, con mapas OSM auto-hospedados y ruteo con restricciones reales de tránsito pesado.

---

## 0\. Resumen de decisiones clave

| Decisión | Elección | Por qué |
| :---- | :---- | :---- |
| Mapas base | OpenStreetMap (auto-hospedado) | Los proveedores chinos no tienen cobertura propia de Argentina fuera de China (ver §13) |
| Renderizado web | MapLibre GL JS | Vectorial, sin dependencia de Google, mismo estilo que en mobile |
| Renderizado mobile | MapLibre Native vía `@maplibre/maplibre-react-native` | `react-native-maps` obliga a usar Google Maps SDK en Android incluso con tiles propios (ver §2.1) |
| Motor de ruteo | GraphHopper **open source auto-hospedado** (no la Directions API paga) | Corre en tu propia infra, soporta perfiles de camión personalizados y modelos dinámicos por request |
| Geocodificación | Nominatim auto-hospedado (extracto de Argentina) | Estándar de facto, PostGIS nativo, mucho más liviano que un import mundial |
| Backend | Spring Boot 3.x / Java 17+ | Pedido explícito |
| Base de datos | PostgreSQL 16 \+ PostGIS | Estándar para datos geoespaciales |
| Teselas | Planetiler → PMTiles/MBTiles servidas con TileServer GL o directo por HTTP range requests | Pipeline moderno, liviano para un solo país |
| Peajes | Dataset propio en PostgreSQL, alimentado con datos abiertos de Vialidad Nacional / AUSA | OSM no tiene tarifas, solo presencia de peaje |

---

## 1\. Visión general de la arquitectura

┌──────────────────────────┐        ┌───────────────────────────────┐

│   Frontend Web (React)   │        │   Frontend Mobile (RN)        │

│   MapLibre GL JS         │        │   @maplibre/maplibre-react-native│

└─────────────┬─────────────┘        └───────────────┬────────────────┘

              │                                       │

              └───────────────┬───────────────────────┘

                               │  REST/JSON \+ JWT

                               ▼

                  ┌─────────────────────────────┐

                  │      Backend Spring Boot     │

                  │  auth · users · truckprofile │

                  │  routing · geocoding · tolls  │

                  └──────┬───────────────┬───────┘

                         │               │

          ┌──────────────┘               └───────────────┐

          ▼                                               ▼

┌───────────────────────┐                     ┌─────────────────────────┐

│ PostgreSQL \+ PostGIS   │                     │  GraphHopper (Docker)    │

│ users, perfiles,       │                     │  grafo de Argentina      │

│ rutas, peajes          │                     │  perfil "truck" custom   │

└───────────────────────┘                     └─────────────────────────┘

          ▲                                               ▲

          │                                               │

┌───────────────────────┐                     ┌─────────────────────────┐

│ Nominatim (geocoder)   │                     │ TileServer GL / PMTiles  │

│ extracto Argentina     │                     │ teselas vectoriales OSM  │

└───────────────────────┘                     └─────────────────────────┘

Cinco servicios independientes (backend, GraphHopper, Nominatim, tileserver, Postgres), orquestados con Docker Compose en desarrollo. El backend es el único punto de contacto para el frontend: orquesta a GraphHopper y Nominatim, nunca los expone directamente.

---

## 2\. Frontend (React \+ React Native)

### 2.1 Librería de mapas

**Web:** `maplibre-gl` (MapLibre GL JS) — fork open source de Mapbox GL JS previo al cambio de licencia. Renderizado vectorial por GPU, sin dependencias de terceros.

**Mobile:** `@maplibre/maplibre-react-native` — wrapper de React Native sobre MapLibre Native (Android/iOS), mantenido activamente. Funciona con cualquier proveedor de teselas vectoriales.

Por qué no `react-native-maps` (tu propuesta original): la documentación oficial del proyecto es explícita — **en Android es obligatorio usar Google Maps**, lo que exige una API key del SDK y una cuenta de facturación en Google Cloud. Hay un issue abierto en el repo donde, aun usando `UrlTile` con tiles propios y `mapType="none"`, el mapa no renderiza sin una API key válida de Google. En iOS podés optar por Apple Maps nativo, pero ahí seguís dependiendo del framework de Apple. Ninguna de las dos rutas cumple con "nada de grandes corporaciones estadounidenses".

MapLibre resuelve esto de raíz: el mismo motor (MapLibre Native) corre en Android e iOS sin invocar SDKs de Google ni Apple, y consume el mismo style JSON (especificación MapLibre/Mapbox Style Spec) que usarías en la versión web. Esto te da, de un mismo golpe, independencia real de Big Tech **y** máxima reutilización de código de estilos/capas entre plataformas — los dos objetivos que planteás en el pedido.

**Si en algún momento preferís simplicidad por sobre reutilización de estilos**, Leaflet sigue siendo una alternativa 100% válida solo para la versión web (más liviano, ecosistema enorme de plugins, tiles raster o vectoriales vía `leaflet-vectorgrid`), pero ahí perdés el compartir estilo con mobile.

### 2.2 Estrategia de reutilización de código

Monorepo con workspaces de npm/yarn \+ Turborepo (o Nx, si preferís). Separás en:

- `apps/web` — React \+ Vite  
- `apps/mobile` — React Native (recomendado *bare workflow* o *Expo con dev client*, porque MapLibre Native requiere módulos nativos que Expo Go no soporta)  
- `packages/core` — cliente HTTP hacia el backend, hooks (`useRouteCalculation`, `useTruckProfile`, `useGeocode`), tipos TypeScript compartidos, validaciones de formularios  
- `packages/map-style` — el style JSON de MapLibre y helpers de capas, compartido 1:1 entre web y mobile

Lo que **no** se comparte 1:1 es el componente `<Map>` en sí (la API de `maplibre-gl` en web y la de `@maplibre/maplibre-react-native` difieren en cómo se declaran capas/fuentes), pero sí se comparte toda la lógica de negocio alrededor: qué pedir al backend, cómo formatear instrucciones turn-by-turn, cómo validar un perfil de camión, etc. Es una reutilización realista (70-80% de la lógica, no del JSX/componentes visuales).

### 2.3 Estructura del frontend

apps/

├── web/

│   ├── src/

│   │   ├── screens/          \# Login, MapScreen, TruckProfileForm, RouteSummary

│   │   ├── components/

│   │   ├── map/               \# wrapper de maplibre-gl específico de web

│   │   └── main.tsx

│   ├── index.html

│   └── package.json

└── mobile/

    ├── src/

    │   ├── screens/

    │   ├── map/                \# wrapper de @maplibre/maplibre-react-native

    │   └── App.tsx

    ├── android/

    ├── ios/

    └── package.json

packages/

├── core/

│   ├── src/api/                \# cliente REST (fetch/axios) tipado

│   ├── src/hooks/

│   └── src/types/

└── map-style/

    └── src/style.json

---

## 3\. Mapas y teselas de OpenStreetMap para Argentina

### 3.1 Obtención de los datos

Extracto regional de Geofabrik (actualizado semanalmente):

https://download.geofabrik.de/south-america/argentina-latest.osm.pbf

Es un archivo de un país, no el planeta completo — esto simplifica muchísimo los requerimientos de hardware en todos los componentes que lo consumen (GraphHopper, Nominatim, generación de teselas).

### 3.2 Generación de teselas vectoriales

**Planetiler** (`onthegomap/planetiler`): genera un `.mbtiles` o `.pmtiles` a partir del `.osm.pbf`, en minutos y en una sola máquina (a diferencia de pipelines más viejos basados en PostgreSQL \+ osm2pgsql \+ Mapnik, que son más pesados de mantener). Para un país como Argentina el proceso completo corre cómodo en una laptop.

docker run \-v $(pwd)/data:/data ghcr.io/onthegomap/planetiler:latest \\

  \--area=argentina \--bounds-provider=geofabrik \\

  \--download \--output=/data/argentina.pmtiles

### 3.3 Servir las teselas — dos caminos válidos

**Opción A (más simple, recomendada para arrancar): PMTiles estático, sin servidor de teselas.** El formato PMTiles empaqueta toda la pirámide de zooms en un único archivo que el navegador/app lee directamente vía HTTP range requests. Alcanza con subir `argentina.pmtiles` a cualquier storage estático (S3, un bucket, o simplemente nginx sirviendo el archivo) con CORS habilitado. MapLibre GL JS lo consume así:

import maplibregl from "maplibre-gl";

import { Protocol } from "pmtiles";

const protocol \= new Protocol();

maplibregl.addProtocol("pmtiles", protocol.tile);

const map \= new maplibregl.Map({

  container: "map",

  style: {

    version: 8,

    sources: {

      argentina: {

        type: "vector",

        url: "pmtiles://https://tu-storage.com/argentina.pmtiles",

        attribution: "© OpenStreetMap contributors"

      }

    },

    layers: \[ /\* tus capas: carreteras, edificios, agua, labels \*/ \]

  }

});

Sin proceso corriendo, sin puntos de falla adicionales, costo casi nulo. Es la opción que recomendamos para esta primera fase.

**Opción B: TileServer GL en Docker.** Si preferís un servidor tradicional (útil si también querés servir raster para algún cliente que no soporte vectorial, o querés el visor web incluido), TileServer GL empaqueta teselas \+ fuentes \+ sprites \+ estilo en un solo contenedor:

tileserver:

  image: maptiler/tileserver-gl:latest

  volumes:

    \- ./tileserver:/data   \# ahí van el .mbtiles/.pmtiles y el style.json

  ports:

    \- "8081:8080"

### 3.4 Estilo del mapa

Partí de un estilo base tipo OSM Bright (esquema de OpenMapTiles) y ajustalo. Como tanto MapLibre GL JS (web) como `@maplibre/maplibre-react-native` (mobile) hablan el mismo lenguaje de estilos, este archivo vive en `packages/map-style` y se comparte sin cambios entre ambas plataformas.

---

## 4\. Motor de ruteo — GraphHopper

### 4.1 Aclaración importante: cuál GraphHopper

Existen dos productos con el mismo nombre:

- **GraphHopper Directions API** (graphhopper.com): servicio cloud pago, con API key, planes por volumen de requests. **No es lo que necesitás.**  
- **`graphhopper/graphhopper`** (GitHub, Apache 2.0): el motor de ruteo en sí, biblioteca Java o servidor standalone, 100% open source y auto-hospedable. **Esto es lo que vamos a usar.**

Toda la configuración de este documento corresponde al segundo.

Un detalle a tener en cuenta: el proyecto **no publica una imagen Docker oficial** (así lo aclaran los propios mantenedores). Existen imágenes de la comunidad bastante usadas (`israelhikingmap/graphhopper` es la más referenciada), pero para tener control total de versión y configuración, en este plan construimos una imagen propia con un `Dockerfile` mínimo (ver `infra/graphhopper/Dockerfile`, adjunto).

### 4.2 Importación de datos y "encoded values"

GraphHopper extrae de cada vía de OSM un conjunto de atributos que llama *encoded values*, derivados de los tags. Solo quedan disponibles en el grafo los que declarás explícitamente en `graph.encoded_values` — vale la pena declarar únicamente los que vas a usar, porque cada uno agranda el grafo compilado.

Para camiones, los relevantes son (todos existen ya en el motor, no hay que programarlos):

| Encoded value | Tag(s) de OSM de origen | Uso |
| :---- | :---- | :---- |
| `max_weight` | `maxweight`, `maxweight:conditional` | Excluir puentes/vías con límite de peso menor al del camión |
| `max_height` | `maxheight` | Excluir túneles/pasos bajos |
| `max_width` | `maxwidth` | Excluir calles angostas |
| `max_length` | `maxlength` | Excluir vías con restricción de longitud (relevante para bitrenes) |
| `max_axle_load` | `maxaxleload` | Restricción por eje |
| `hgv` | `hgv=no/yes/designated/destination` | Prohibición explícita para camiones (independiente del resto) |
| `hazmat` | `hazmat=no` | Solo si el camión transporta carga peligrosa |
| `road_access` | `access=private`, etc. | Excluir vías privadas |
| `road_class` | `highway=*` | Ajustar velocidades por tipo de vía |
| `toll` | `toll=yes` \+ variantes | Detectar (no valorizar) tramos con peaje |

### 4.3 El perfil "truck": modelo base \+ modelo dinámico por request

Acá está la decisión de diseño más importante de esta sección. Un camión no es "un" perfil fijo — cada usuario tiene dimensiones distintas. GraphHopper resuelve esto con **modelos personalizados por request**: podés declarar en el servidor un modelo base para el perfil `truck` (reglas que aplican a *cualquier* camión: prohibiciones legales de `hgv`, vías privadas, etc.) y, en cada llamada a `/route`, el backend envía un `custom_model` adicional con las reglas específicas de *ese* camión (sus metros y toneladas concretos). GraphHopper combina ambos automáticamente, agregando las condiciones del request después de las del servidor.

**Modelo base, server-side** (`infra/graphhopper/custom_models/truck-base.json`, adjunto — partido de la plantilla `truck.json` que trae el propio GraphHopper):

{

  "priority": \[

    { "if": "hgv \== NO", "multiply\_by": "0" },

    { "if": "road\_access \== PRIVATE", "multiply\_by": "0" },

    { "if": "road\_class \== STEPS", "multiply\_by": "0" },

    { "if": "road\_class \== TRACK && surface \== GROUND", "multiply\_by": "0.1" },

    { "if": "toll \== ALL || toll \== HGV", "multiply\_by": "0.9" }

  \],

  "speed": \[

    { "if": "road\_class \== MOTORWAY", "limit\_to": "90" },

    { "if": "road\_class \== TRUNK || road\_class \== PRIMARY", "limit\_to": "80" },

    { "if": "road\_class \== SECONDARY || road\_class \== TERTIARY", "limit\_to": "70" }

  \],

  "distance\_influence": 30

}

**Modelo dinámico, construido por el backend según el perfil del camión del usuario** — se envía en el body del POST a `/route`:

{

  "priority": \[

    { "if": "max\_weight \< 24", "multiply\_by": "0" },

    { "if": "max\_height \< 4.2", "multiply\_by": "0" },

    { "if": "max\_width \< 2.6", "multiply\_by": "0" },

    { "if": "max\_length \< 18", "multiply\_by": "0" }

  \]

}

El código Java que arma este segundo bloque (ver §5.3) simplemente reemplaza esos números por los del `TruckProfile` guardado en la base — no hay "variables" en el lenguaje de custom models, la sustitución la hace tu código antes de mandar el request.

### 4.4 Configuración del servidor (`config.yml`)

Ver archivo completo adjunto en `infra/graphhopper/config.yml`. Los puntos clave:

graphhopper:

  datareader.file: /data/argentina-latest.osm.pbf

  graph.location: /data/graph-cache

  graph.encoded\_values: \>-

    car\_access, car\_average\_speed, road\_access, road\_class, road\_class\_link,

    road\_environment, max\_speed, surface, max\_width, max\_height, max\_weight,

    max\_weight\_except, max\_length, max\_axle\_load, hgv, hazmat, toll, track\_type

  custom\_models.directory: /app/custom\_models

  profiles:

    \- name: car

      vehicle: car

    \- name: truck

      vehicle: car

      custom\_model\_files: \[truck-base.json\]

  profiles\_lm:

    \- profile: truck

Notá que el perfil `truck` se construye `vehicle: car` como base (el motor open source no tiene un "FlagEncoder" separado para camión — eso era de la API comercial vieja; en la versión actual, "camión" es simplemente el vehículo `car` con un custom model encima).

### 4.5 Rendimiento: CH vs. modo híbrido (LM) vs. flexible

GraphHopper ofrece tres modos:

- **CH (Contraction Hierarchies / "modo veloz")**: rutas en milisegundos, pero el grafo se pre-procesa para un costo fijo — **no admite personalizar el modelo por request**. No sirve para nuestro caso, donde cada camión pesa distinto.  
- **LM (Landmarks / "modo híbrido")**: bastante rápido, y sí admite un `custom_model` distinto en cada request, con dos condiciones: los `multiply_by` del modelo del request deben estar entre 0 y 1 (nuestras reglas de exclusión usan `"0"`, que cumple), y el `distance_influence` del request no puede ser menor al del servidor.  
- **Flexible (sin pre-cálculo)**: sin ninguna restricción, pero más lento por consulta.

Por eso el perfil `truck` está registrado solo bajo `profiles_lm`: es el mejor equilibrio entre velocidad y flexibilidad para el volumen esperado en esta primera etapa. El request incluye `"ch.disable": true` para asegurarse de no caer en el modo veloz. Si el volumen de tráfico crece mucho, una evolución natural es precalcular un puñado de perfiles CH para combinaciones típicas ("liviano", "semi", "bitren") en lugar de un modelo 100% dinámico por usuario.

---

## 5\. Backend Spring Boot

### 5.1 Módulos

ar.com.truckroutes/

├── auth/              \# registro, login, JWT

├── user/

├── truckprofile/       \# CRUD de perfiles de camión

├── routing/            \# orquesta a GraphHopper

├── geocoding/           \# proxy a Nominatim

├── tolls/               \# referencia de peajes \+ cruce con geometría de ruta

├── incident/            \# fase 2

└── config/

### 5.2 Cliente hacia GraphHopper

package ar.com.truckroutes.routing;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.stereotype.Service;

import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;

import java.util.List;

import java.util.Map;

@Service

public class GraphHopperClient {

    private final RestClient restClient;

    public GraphHopperClient(@Value("${graphhopper.url}") String graphhopperUrl) {

        this.restClient \= RestClient.create(graphhopperUrl);

    }

    public Map\<String, Object\> calculateRoute(double\[\] origin, double\[\] destination,

                                               Map\<String, Object\> customModel) {

        Map\<String, Object\> body \= new LinkedHashMap\<\>();

        body.put("profile", "truck");

        body.put("points", List.of(

                List.of(origin\[1\], origin\[0\]),        // GraphHopper espera \[lon, lat\]

                List.of(destination\[1\], destination\[0\])

        ));

        body.put("custom\_model", customModel);

        body.put("ch.disable", true);      // obligatorio para usar custom\_model por request

        body.put("instructions", true);     // turn-by-turn

        body.put("points\_encoded", false);  // geometría como GeoJSON, no polyline codificado

        return restClient.post()

                .uri("/route")

                .body(body)

                .retrieve()

                .body(Map.class);

    }

}

### 5.3 Construcción del modelo dinámico según el perfil del camión

package ar.com.truckroutes.routing;

import ar.com.truckroutes.truckprofile.TruckProfile;

import org.springframework.stereotype.Component;

import java.util.ArrayList;

import java.util.LinkedHashMap;

import java.util.List;

import java.util.Map;

@Component

public class CustomModelBuilder {

    public Map\<String, Object\> build(TruckProfile truck) {

        List\<Map\<String, Object\>\> priority \= new ArrayList\<\>();

        priority.add(rule("max\_weight \< " \+ truck.getMaxWeightTons(), "0"));

        priority.add(rule("max\_height \< " \+ truck.getMaxHeightM(), "0"));

        priority.add(rule("max\_width \< " \+ truck.getMaxWidthM(), "0"));

        priority.add(rule("max\_length \< " \+ truck.getMaxLengthM(), "0"));

        if ("peligrosa".equalsIgnoreCase(truck.getCargoType())) {

            priority.add(rule("hazmat \== NO", "0"));

        }

        Map\<String, Object\> customModel \= new LinkedHashMap\<\>();

        customModel.put("priority", priority);

        customModel.put("distance\_influence", 30);

        return customModel;

    }

    private Map\<String, Object\> rule(String condition, String multiplyBy) {

        Map\<String, Object\> rule \= new LinkedHashMap\<\>();

        rule.put("if", condition);

        rule.put("multiply\_by", multiplyBy);

        return rule;

    }

}

### 5.4 Controller

package ar.com.truckroutes.routing;

import ar.com.truckroutes.truckprofile.TruckProfile;

import ar.com.truckroutes.truckprofile.TruckProfileRepository;

import org.springframework.web.bind.annotation.\*;

import java.util.Map;

import java.util.UUID;

@RestController

@RequestMapping("/api/routes")

public class RouteController {

    private final GraphHopperClient graphHopperClient;

    private final CustomModelBuilder customModelBuilder;

    private final TruckProfileRepository truckProfileRepository;

    private final RouteService routeService;

    public RouteController(GraphHopperClient graphHopperClient,

                            CustomModelBuilder customModelBuilder,

                            TruckProfileRepository truckProfileRepository,

                            RouteService routeService) {

        this.graphHopperClient \= graphHopperClient;

        this.customModelBuilder \= customModelBuilder;

        this.truckProfileRepository \= truckProfileRepository;

        this.routeService \= routeService;

    }

    @PostMapping

    public RouteResponse calculate(@RequestBody RouteRequest request) {

        TruckProfile truck \= truckProfileRepository.findById(request.truckProfileId())

                .orElseThrow();

        Map\<String, Object\> customModel \= customModelBuilder.build(truck);

        Map\<String, Object\> ghResponse \= graphHopperClient.calculateRoute(

                request.origin(), request.destination(), customModel);

        return routeService.buildResponseAndPersist(ghResponse, request, truck);

    }

    record RouteRequest(double\[\] origin, double\[\] destination, UUID truckProfileId) {}

}

`RouteService` es responsable de: parsear la geometría GeoJSON que devuelve GraphHopper, cruzarla contra `toll_stations` (ver §7.2) y persistir el resultado en `routes`.

### 5.5 Dependencias clave (`pom.xml`, resumido)

\<dependencies\>

    \<dependency\>

        \<groupId\>org.springframework.boot\</groupId\>

        \<artifactId\>spring-boot-starter-web\</artifactId\>

    \</dependency\>

    \<dependency\>

        \<groupId\>org.springframework.boot\</groupId\>

        \<artifactId\>spring-boot-starter-data-jpa\</artifactId\>

    \</dependency\>

    \<dependency\>

        \<groupId\>org.springframework.boot\</groupId\>

        \<artifactId\>spring-boot-starter-security\</artifactId\>

    \</dependency\>

    \<dependency\>

        \<groupId\>org.postgresql\</groupId\>

        \<artifactId\>postgresql\</artifactId\>

        \<scope\>runtime\</scope\>

    \</dependency\>

    \<dependency\>

        \<groupId\>org.flywaydb\</groupId\>

        \<artifactId\>flyway-core\</artifactId\>

    \</dependency\>

    \<dependency\>

        \<groupId\>org.flywaydb\</groupId\>

        \<artifactId\>flyway-database-postgresql\</artifactId\>

    \</dependency\>

    \<dependency\>

        \<\!-- JWT: verificar la versión estable más reciente en Maven Central \--\>

        \<groupId\>io.jsonwebtoken\</groupId\>

        \<artifactId\>jjwt-api\</artifactId\>

        \<version\>0.12.6\</version\>

    \</dependency\>

\</dependencies\>

**Nota sobre geometrías y JPA:** para las entidades sin geometría (`users`, `truck_profiles`) usá Spring Data JPA normal. Para las que sí tienen geometría (`routes`, `toll_stations`) y sus consultas espaciales (`ST_DWithin`, `ST_GeomFromGeoJSON`), muchos equipos prefieren `JdbcTemplate` o jOOQ con SQL nativo de PostGIS en vez de mapear geometrías vía Hibernate Spatial — evita fricción de compatibilidad de versiones entre Hibernate/JTS/PostGIS y es más directo para este tipo de queries.

### 5.6 `application.yml`

server:

  port: 8080

spring:

  datasource:

    url: jdbc:postgresql://${DB\_HOST:localhost}:5432/truckroutes

    username: ${DB\_USER:truckroutes}

    password: ${DB\_PASSWORD:change\_me}

  jpa:

    hibernate:

      ddl-auto: validate

  flyway:

    enabled: true

    locations: classpath:db/migration

graphhopper:

  url: ${GRAPHHOPPER\_URL:http://localhost:8989}

nominatim:

  url: ${NOMINATIM\_URL:http://localhost:7070}

jwt:

  secret: ${JWT\_SECRET:change\_this\_in\_production}

  expiration-minutes: 60

---

## 6\. Geocodificación

### 6.1 Nominatim auto-hospedado

Estándar de facto para geocodificación sobre OSM, PostgreSQL \+ PostGIS nativo. Escopado a Argentina (no al planeta), los requerimientos de hardware bajan drásticamente frente a un import mundial. Imagen de comunidad ampliamente usada: `mediagis/nominatim` (verificá el tag más reciente en Docker Hub al momento de desplegar).

El backend expone un endpoint propio que hace de proxy — nunca expongas Nominatim directo al frontend, para poder cachear, aplicar rate-limiting propio y normalizar el formato de respuesta:

GET /api/geocode?q=Ruta+Nacional+9+km+45,+Córdoba

### 6.2 Photon como mejora opcional

`komoot/photon` da una experiencia de autocompletado ("search-as-you-type") con tolerancia a errores de tipeo, corriendo sobre Elasticsearch. Se alimenta importando datos *desde* una base Nominatim ya existente — es decir, es una capa encima de Nominatim, no un reemplazo. Para el MVP, Nominatim solo alcanza y de sobra; dejá Photon como mejora de UX para una segunda iteración si la búsqueda por dirección se siente lenta o poco tolerante a errores.

---

## 7\. Peajes

### 7.1 Fuentes de datos oficiales argentinas

OSM marca `toll=yes` en las vías pero no el importe. Para eso hay datos abiertos oficiales:

- **Dirección Nacional de Vialidad** (datos.transporte.gob.ar): datasets de "Peajes" y "Rutas Nacionales" en formato GeoJSON/KML/Shape, con ubicación georreferenciada de cada estación.  
- **AUSA** (Autopistas Urbanas de Buenos Aires, en data.buenosaires.gob.ar): ubicación de peajes y pórticos de las autopistas de la Ciudad.  
- Tarifas vigentes: publicadas en argentina.gob.ar/transporte/vialidad-nacional.

Ninguna de estas fuentes te da un JSON con tarifa-por-tipo-de-vehículo actualizada en tiempo real vía API — hay que armar una tabla propia y refrescarla periódicamente (manual o con un scraper liviano de la página de tarifas). Vale la pena tenerlo en cuenta: Argentina está migrando sus peajes al sistema *free flow* (sin cabinas), con plazo del gobierno para completar la transición a fines de 2026 — la ubicación de los pórticos puede cambiar de "cabina física" a "pórtico virtual" en ese proceso, así que el dataset conviene revisarlo cada tanto.

### 7.2 Modelo de estimación

Tabla propia `toll_stations` (ver esquema en §8) con el precio para camión de cada estación conocida. Al calcular una ruta, se cruza la geometría contra la tabla:

SELECT t.name, t.price\_truck

FROM toll\_stations t

WHERE ST\_DWithin(

    t.location::geography,

    ST\_GeomFromGeoJSON(:route\_geometry\_geojson)::geography,

    100  \-- metros de tolerancia

);

Sumás los `price_truck` de las estaciones que caen sobre la ruta y eso es tu estimado. No es exacto al centavo (las tarifas cambian, hay categorías de eje que OSM no modela), pero es un estimado razonable — y muchísimo mejor que no mostrar nada.

---

## 8\. Base de datos — PostgreSQL \+ PostGIS

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (

    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    email VARCHAR(255) UNIQUE NOT NULL,

    password\_hash VARCHAR(255) NOT NULL,

    full\_name VARCHAR(255),

    created\_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE TABLE truck\_profiles (

    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    user\_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,

    max\_weight\_tons NUMERIC(6,2) NOT NULL,

    max\_height\_m NUMERIC(4,2) NOT NULL,

    max\_width\_m NUMERIC(4,2) NOT NULL,

    max\_length\_m NUMERIC(5,2) NOT NULL,

    cargo\_type VARCHAR(40) NOT NULL DEFAULT 'general', \-- general | refrigerada | peligrosa | ...

    created\_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE TABLE routes (

    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    user\_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    truck\_profile\_id UUID REFERENCES truck\_profiles(id),

    origin geometry(Point, 4326\) NOT NULL,

    destination geometry(Point, 4326\) NOT NULL,

    geometry geometry(LineString, 4326),

    distance\_m INTEGER,

    duration\_s INTEGER,

    estimated\_tolls\_ars NUMERIC(10,2),

    raw\_response JSONB,

    created\_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX idx\_routes\_geometry ON routes USING GIST (geometry);

CREATE TABLE toll\_stations (

    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    name VARCHAR(255) NOT NULL,

    location geometry(Point, 4326\) NOT NULL,

    operator VARCHAR(120),        \-- Vialidad Nacional | AUSA | concesionaria privada

    price\_car NUMERIC(10,2),

    price\_truck NUMERIC(10,2),

    source VARCHAR(255),          \-- referencia al dataset oficial de origen

    updated\_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

CREATE INDEX idx\_toll\_stations\_location ON toll\_stations USING GIST (location);

\-- Fase 2: incidencias estilo Waze

CREATE TABLE incidents (

    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),

    user\_id UUID REFERENCES users(id),

    type VARCHAR(40) NOT NULL,     \-- corte | mal\_estado | control | accidente

    location geometry(Point, 4326\) NOT NULL,

    description TEXT,

    upvotes INTEGER NOT NULL DEFAULT 0,

    created\_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    expires\_at TIMESTAMPTZ

);

CREATE INDEX idx\_incidents\_location ON incidents USING GIST (location);

---

## 9\. Endpoints REST

Auth

  POST   /api/auth/register

  POST   /api/auth/login

  POST   /api/auth/refresh

Usuario y perfiles de camión

  GET    /api/users/me

  GET    /api/truck-profiles

  POST   /api/truck-profiles

  GET    /api/truck-profiles/{id}

  PUT    /api/truck-profiles/{id}

  DELETE /api/truck-profiles/{id}

Geocodificación

  GET    /api/geocode?q={texto}\&limit=5

  GET    /api/geocode/reverse?lat={lat}\&lon={lon}

Ruteo

  POST   /api/routes            body: { origin, destination, truckProfileId }

  GET    /api/routes/{id}

  GET    /api/routes            historial del usuario

Incidencias (fase 2\)

  POST   /api/incidents

  GET    /api/incidents?bbox={minLon},{minLat},{maxLon},{maxLat}

  POST   /api/incidents/{id}/upvote

---

## 10\. Flujo end-to-end

1. El usuario se autentica (JWT guardado en el cliente).  
2. Selecciona o crea un perfil de camión (peso, alto, ancho, largo, tipo de carga) → se guarda en `truck_profiles`.  
3. Busca un destino por dirección → el frontend llama a `GET /api/geocode` → el backend delega a Nominatim → devuelve candidatos → el usuario elige uno (o toca directamente el mapa para un punto exacto).  
4. El frontend hace `POST /api/routes` con origen (GPS actual o manual), destino y el `truckProfileId`.  
5. El backend carga el perfil de camión, construye el `custom_model` dinámico (§5.3) y llama a GraphHopper (`POST /route`) combinándolo con el modelo base del servidor.  
6. GraphHopper devuelve geometría, instrucciones turn-by-turn, distancia y tiempo.  
7. El backend cruza la geometría contra `toll_stations` para estimar peajes, arma la respuesta final y la persiste en `routes`.  
8. El frontend recibe la respuesta, dibuja la polilínea sobre MapLibre (web o mobile) y muestra las instrucciones paso a paso.

---

## 11\. Estructura de proyecto sugerida (monorepo completo)

truck-nav-ar/

├── apps/

│   ├── web/

│   └── mobile/

├── packages/

│   ├── core/

│   └── map-style/

├── package.json

├── turbo.json

│

├── backend/

│   ├── src/main/java/ar/com/truckroutes/

│   │   ├── auth/

│   │   ├── user/

│   │   ├── truckprofile/

│   │   ├── routing/

│   │   │   ├── RouteController.java

│   │   │   ├── GraphHopperClient.java

│   │   │   ├── CustomModelBuilder.java

│   │   │   └── RouteService.java

│   │   ├── geocoding/

│   │   ├── tolls/

│   │   ├── incident/

│   │   └── config/

│   ├── src/main/resources/

│   │   ├── application.yml

│   │   └── db/migration/        \# Flyway: V1\_\_init.sql, V2\_\_tolls.sql...

│   └── pom.xml

│

└── infra/

    ├── docker-compose.yml

    ├── graphhopper/

    │   ├── Dockerfile

    │   ├── config.yml

    │   └── custom\_models/

    │       └── truck-base.json

    ├── tileserver/

    │   └── styles/

    ├── nominatim/

    └── data/

        └── argentina-latest.osm.pbf   \# no versionado en git

---

## 12\. Orquestación local

Ver `infra/docker-compose.yml` adjunto — levanta Postgres+PostGIS, Nominatim, GraphHopper (build propio) y TileServer GL con un solo `docker compose up`. El backend se agrega al mismo compose o se corre aparte según tu flujo de desarrollo habitual.

---

## 13\. Sobre los proveedores de mapas chinos (nota de viabilidad)

Se evaluaron como primera opción, según lo pedido, y se descartan por motivos concretos, no de preferencia:

- **Baidu Maps**: fuera de China se apoya en una alianza con HERE Technologies (empresa con sede en Ámsterdam) para el contenido de mapas — no es data propia de Baidu. Además, a los desarrolladores no chinos les cuesta registrar una cuenta de desarrollador para acceder a las APIs de localización, y toda la documentación técnica es en chino.  
- **Amap / Gaode**: mismo problema — desde 2020 delega en HERE Technologies el contenido de mapas y tráfico fuera de China.  
- **Tencent Maps**: cobertura nula fuera de China — el resto del mundo aparece directamente sin explorar en el mapa, y conseguir una cuenta de desarrollador internacional es igual de difícil.

Conclusión: ninguno te da mapas ni ruteo real de Argentina con datos propios, y donde sí "cubren" el resto del mundo terminás dependiendo de la misma industria occidental que buscabas evitar, con documentación en chino de por medio. OpenStreetMap auto-hospedado es, en los hechos, la única alternativa seria — y además es la más alineada con el espíritu de "herramienta comunitaria" del resto de tu stack.

---

## 14\. Roadmap — Fase 2 (incidencias estilo Waze)

El esquema de `incidents` y los endpoints ya están contemplados arriba para no tener que rediseñar nada cuando llegue el momento. Para la implementación real conviene sumar:

- Expiración automática (`expires_at`) para que los reportes viejos dejen de mostrarse solos.  
- Un mecanismo simple de confirmación/refutación comunitaria (upvote/downvote) antes de invertir en moderación más sofisticada.  
- Filtrado por bounding box (`bbox`) para no traer incidencias de todo el país en cada consulta del mapa.

## 15\. Consideraciones adicionales

- **`turn_costs`**: para rutas más realistas (evitar que un camión largo tenga que hacer giros en U imposibles), se puede habilitar `turn_costs` en el perfil `truck` — queda como ajuste fino, no bloqueante para el MVP.  
- **Versión de GraphHopper**: la rama estable al momento de escribir esto es la serie 11.x — confirmá la última release en `github.com/graphhopper/graphhopper/releases` antes de fijar la versión en el Dockerfile.  
- **Actualizaciones de datos**: tanto el `.osm.pbf` de Argentina como el índice de Nominatim conviene refrescarlos periódicamente (Geofabrik publica extractos actualizados semanalmente).

---

## Referencias consultadas

- GraphHopper — documentación de perfiles y custom models: github.com/graphhopper/graphhopper/blob/master/docs/core/profiles.md  
- GraphHopper — repositorio principal y changelog: github.com/graphhopper/graphhopper  
- react-native-maps — documentación de instalación: github.com/react-native-maps/react-native-maps  
- MapLibre React Native: github.com/maplibre/maplibre-react-native  
- Planetiler: github.com/onthegomap/planetiler  
- Photon (Komoot): github.com/komoot/photon  
- Datos abiertos Vialidad Nacional (peajes y rutas): datos.transporte.gob.ar  
- Datos abiertos AUSA: data.buenosaires.gob.ar

