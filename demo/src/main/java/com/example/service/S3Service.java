package com.example.service;

import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.example.model.Product;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3Service {

    private static final Logger logger = LoggerFactory.getLogger(S3Service.class);
    
    private final S3Client s3Client;
    private final String bucketName;

    public S3Service(
            @Value("${data.bucket.name}") String bucketName,
            @Value("${aws.region:us-east-1}") String regionName) {
        
        Region region = Region.of(regionName);
        logger.info("Initializing S3 client with region: {}", region.id());
        
        this.s3Client = S3Client.builder()
                .region(region)
                .build();
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
            String key = "products/" + product.getId() + ".json";
            
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType("application/json")
                .build();
                
            s3Client.putObject(putObjectRequest, 
                RequestBody.fromString(content, StandardCharsets.UTF_8));
            
            logger.info("Product {} saved to S3 at {}/{}", product.getId(), bucketName, key);
        } catch (Exception e) {
            logger.error("Error saving product to S3", e);
            throw new RuntimeException("Failed to save product to S3", e);
        }
    }
    
    public String getProductFromS3(Long productId) {
        try {
            String key = "products/" + productId + ".json";
            
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .build();
                
            return s3Client.getObjectAsBytes(getObjectRequest).asUtf8String();
        } catch (Exception e) {
            logger.error("Error retrieving product from S3", e);
            return null;
        }
    }
    
    public boolean deleteProductFromS3(Long productId) {
        try {
            logger.info("Deleting product from S3: {}", productId);
            String key = "products/" + productId + ".json";
            
            // Check if object exists
            try {
                HeadObjectRequest headObjectRequest = HeadObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();
                    
                s3Client.headObject(headObjectRequest);
                
                // If we get here, the object exists, so delete it
                DeleteObjectRequest deleteObjectRequest = DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();
                    
                s3Client.deleteObject(deleteObjectRequest);
                logger.info("Product {} deleted from S3", productId);
                return true;
            } catch (NoSuchKeyException e) {
                logger.warn("Product {} not found in S3", productId);
                return false;
            }
        } catch (Exception e) {
            logger.error("Error deleting product from S3", e);
            throw new RuntimeException("Failed to delete product from S3", e);
        }
    }
}
