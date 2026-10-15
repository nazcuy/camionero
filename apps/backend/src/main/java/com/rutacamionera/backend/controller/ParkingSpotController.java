package com.rutacamionera.backend.controller;

import com.rutacamionera.backend.model.ParkingSpot;
import com.rutacamionera.backend.model.User;
import com.rutacamionera.backend.service.ParkingSpotService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/parking")
public class ParkingSpotController {

    private final ParkingSpotService parkingSpotService;

    public ParkingSpotController(ParkingSpotService parkingSpotService) {
        this.parkingSpotService = parkingSpotService;
    }

    @GetMapping
    public ResponseEntity<ParkingSpotResponse> getParkingSpot(@AuthenticationPrincipal User user) {
        return parkingSpotService.findByUser(user)
                .map(ParkingSpotController::toResponse)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping
    public ResponseEntity<?> saveParkingSpot(@AuthenticationPrincipal User user,
                                             @RequestBody ParkingSpotRequest request) {
        if (request.latitude() == null || request.longitude() == null
                || !Double.isFinite(request.latitude()) || !Double.isFinite(request.longitude())
                || request.latitude() < -90 || request.latitude() > 90
                || request.longitude() < -180 || request.longitude() > 180) {
            return ResponseEntity.badRequest().body("Coordenadas inválidas");
        }

        ParkingSpot parkingSpot = parkingSpotService.saveForUser(
                user, request.latitude(), request.longitude());
        return ResponseEntity.ok(toResponse(parkingSpot));
    }

    private static ParkingSpotResponse toResponse(ParkingSpot parkingSpot) {
        return new ParkingSpotResponse(parkingSpot.getLatitude(), parkingSpot.getLongitude());
    }

    public record ParkingSpotRequest(Double latitude, Double longitude) {}

    public record ParkingSpotResponse(double latitude, double longitude) {}
}
