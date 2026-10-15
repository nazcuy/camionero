package com.rutacamionera.backend.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.rutacamionera.backend.model.User;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class RouteController {

    private final RestTemplate restTemplate = new RestTemplate();
    private final String graphhopperUrl = "http://localhost:8989/route";

    @GetMapping("/route")
    public Map<String, Object> getRoute(@RequestParam double fromLat,
                                        @RequestParam double fromLon,
                                        @RequestParam double toLat,
                                        @RequestParam double toLon,
                                        @AuthenticationPrincipal User user) {
        String url = graphhopperUrl +
                "?point=" + fromLat + "," + fromLon +
                "&point=" + toLat + "," + toLon +
                "&profile=car" +
                "&points_encoded=false" +
                "&instructions=false" +
                "&calc_points=true";

        return restTemplate.getForObject(url, Map.class);
    }
}