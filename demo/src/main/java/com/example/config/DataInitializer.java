package com.example.config;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import com.example.model.Product;
import com.example.repository.ProductRepository;
import com.example.service.S3Service;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);
    
    private final ProductRepository productRepository;
    private final S3Service s3Service;
    
    @Autowired
    public DataInitializer(ProductRepository productRepository, S3Service s3Service) {
        this.productRepository = productRepository;
        this.s3Service = s3Service;
    }

    @Override
    public void run(String... args) throws Exception {
        logger.info("Checking if database has been initialized with sample data...");
        
        if (productRepository.count() == 0) {
            logger.info("No products found in database. Creating sample products programmatically...");
            
            List<Product> products = Arrays.asList(
                createProduct("Laptop", "High-performance laptop with 16GB RAM", new BigDecimal("1299.99"), 10),
                createProduct("Smartphone", "Latest model with 128GB storage", new BigDecimal("899.99"), 15),
                createProduct("Headphones", "Noise-cancelling wireless headphones", new BigDecimal("249.99"), 20),
                createProduct("Tablet", "10-inch tablet with retina display", new BigDecimal("499.99"), 8),
                createProduct("Smartwatch", "Fitness tracking and notifications", new BigDecimal("199.99"), 12)
            );
            
            for (Product product : products) {
                try {
                    Product savedProduct = productRepository.save(product);
                    logger.info("Created product in database: {}", savedProduct.getName());
                    
                    // Also save to S3
                    s3Service.saveProductToS3(savedProduct);
                    logger.info("Saved product to S3: {}", savedProduct.getName());
                } catch (Exception e) {
                    logger.error("Error creating product: {}", e.getMessage(), e);
                }
            }
            
            logger.info("Sample data initialization complete. Created {} products", products.size());
        } else {
            logger.info("Database already contains {} products, skipping initialization", productRepository.count());
        }
    }
    
    private Product createProduct(String name, String description, BigDecimal price, Integer stockQuantity) {
        Product product = new Product();
        product.setName(name);
        product.setDescription(description);
        product.setPrice(price);
        product.setStockQuantity(stockQuantity);
        product.setCreatedAt(LocalDateTime.now());
        product.setUpdatedAt(LocalDateTime.now());
        return product;
    }
}
