package com.example.service;

import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.AmazonS3ClientBuilder;
import com.amazonaws.services.s3.model.ObjectMetadata;
import com.amazonaws.services.s3.model.PutObjectRequest;
import com.example.model.Product;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

@Service
public class S3Service {

    private static final Logger logger = LoggerFactory.getLogger(S3Service.class);
    
    private final AmazonS3 s3Client;
    private final String bucketName;

    public S3Service(@Value("${data.bucket.name}") String bucketName) {
        this.s3Client = AmazonS3ClientBuilder.standard().build();
        this.bucketName = bucketName;
        logger.info("S3Service initialized with bucket: {}", bucketName);
    }

    public void saveProductToS3(Product product) {
        try {
            logger.info("Saving product to S3: {}", product.getId());
            
            // Create JSON content
            String content = String.format(
                "{\n" +
                "  \"id\": %d,\n" +
                "  \"name\": \"%s\",\n" +
                "  \"description\": \"%s\",\n" +
                "  \"price\": %s,\n" +
                "  \"stockQuantity\": %d\n" +
                "}",
                product.getId(),
                product.getName(),
                product.getDescription() != null ? product.getDescription() : "",
                product.getPrice(),
                product.getStockQuantity() != null ? product.getStockQuantity() : 0
            );
            
            // Upload to S3
            byte[] contentBytes = content.getBytes(StandardCharsets.UTF_8);
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(contentBytes.length);
            metadata.setContentType("application/json");
            
            String key = "products/" + product.getId() + ".json";
            
            s3Client.putObject(new PutObjectRequest(
                bucketName,
                key,
                new ByteArrayInputStream(contentBytes),
                metadata
            ));
            
            logger.info("Product {} saved to S3 at {}/{}", product.getId(), bucketName, key);
        } catch (Exception e) {
            logger.error("Error saving product to S3", e);
            throw new RuntimeException("Failed to save product to S3", e);
        }
    }
    
    public boolean deleteProductFromS3(Long productId) {
        try {
            logger.info("Deleting product from S3: {}", productId);
            String key = "products/" + productId + ".json";
            
            if (s3Client.doesObjectExist(bucketName, key)) {
                s3Client.deleteObject(bucketName, key);
                logger.info("Product {} deleted from S3", productId);
                return true;
            } else {
                logger.warn("Product {} not found in S3", productId);
                return false;
            }
        } catch (Exception e) {
            logger.error("Error deleting product from S3", e);
            throw new RuntimeException("Failed to delete product from S3", e);
        }
    }
}
