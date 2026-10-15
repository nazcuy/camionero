package com.rutacamionera.backend.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.rutacamionera.backend.model.User;
import com.rutacamionera.backend.security.JwtUtils;
import com.rutacamionera.backend.service.UserService;

import jakarta.annotation.PostConstruct;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @PostConstruct
    public void init() {
        System.out.println(">>> AuthController cargado correctamente <<<");
    }

    private final UserService userService;
    private final JwtUtils jwtUtils;

    public AuthController(UserService userService, JwtUtils jwtUtils) {
        this.userService = userService;
        this.jwtUtils = jwtUtils;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        try {
            User user = userService.register(
                    body.get("email"),
                    body.get("password"),
                    body.get("fullName")
            );
            String token = jwtUtils.generateToken(user.getEmail());
            return ResponseEntity.ok(Map.of("token", token, "email", user.getEmail()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String password = body.get("password");
        try {
            User user = userService.findByEmail(email);
            boolean ok = userService.checkPassword(password, user.getPassword());
            if (!ok) {
                return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
            }
            String token = jwtUtils.generateToken(user.getEmail());
            return ResponseEntity.ok(Map.of("token", token, "email", user.getEmail()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
        }
    }
}