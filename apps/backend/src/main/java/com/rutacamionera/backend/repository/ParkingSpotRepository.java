package com.rutacamionera.backend.repository;

import com.rutacamionera.backend.model.ParkingSpot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ParkingSpotRepository extends JpaRepository<ParkingSpot, UUID> {
    Optional<ParkingSpot> findByUser_Id(UUID userId);
}
