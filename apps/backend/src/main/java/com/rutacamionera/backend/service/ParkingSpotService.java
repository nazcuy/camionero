package com.rutacamionera.backend.service;

import com.rutacamionera.backend.model.ParkingSpot;
import com.rutacamionera.backend.model.User;
import com.rutacamionera.backend.repository.ParkingSpotRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class ParkingSpotService {

    private final ParkingSpotRepository parkingSpotRepository;

    public ParkingSpotService(ParkingSpotRepository parkingSpotRepository) {
        this.parkingSpotRepository = parkingSpotRepository;
    }

    public Optional<ParkingSpot> findByUser(User user) {
        return parkingSpotRepository.findByUser_Id(user.getId());
    }

    @Transactional
    public ParkingSpot saveForUser(User user, double latitude, double longitude) {
        ParkingSpot parkingSpot = parkingSpotRepository.findByUser_Id(user.getId())
                .map(existingSpot -> {
                    existingSpot.setCoordinates(latitude, longitude);
                    return existingSpot;
                })
                .orElseGet(() -> new ParkingSpot(user, latitude, longitude));
        return parkingSpotRepository.save(parkingSpot);
    }
}
