package com.example.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;

import com.example.exception.ResourceNotFoundException;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Enhanced exception handler to log and handle database-specific exceptions
 */
@ControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class DatabaseExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseExceptionHandler.class);

    /**
     * Handle SQL exceptions
     */
    @ExceptionHandler(SQLException.class)
    public ResponseEntity<?> handleSQLException(SQLException ex, WebRequest request) {
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("message", "Database error occurred");
        body.put("details", request.getDescription(false));
        
        logger.error("SQL Exception: {}", ex.getMessage(), ex);
        
        return new ResponseEntity<>(body, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    
    /**
     * Handle connection timeout exceptions
     */
    @ExceptionHandler(java.sql.SQLTransientConnectionException.class)
    public ResponseEntity<?> handleConnectionTimeout(
            java.sql.SQLTransientConnectionException ex, WebRequest request) {
        
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("message", "Database connection timeout");
        body.put("details", request.getDescription(false));
        
        logger.error("Database connection timeout: {}", ex.getMessage(), ex);
        
        return new ResponseEntity<>(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
}
