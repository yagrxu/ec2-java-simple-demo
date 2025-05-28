package com.example.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.exception.ResourceNotFoundException;
import com.example.model.Product;
import com.example.repository.ProductRepository;

@Service
public class ProductService {

    private static final Logger logger = LoggerFactory.getLogger(ProductService.class);
    
    private final ProductRepository productRepository;
    private final S3Service s3Service;

    @Autowired
    public ProductService(ProductRepository productRepository, S3Service s3Service) {
        this.productRepository = productRepository;
        this.s3Service = s3Service;
    }

    public List<Product> getAllProducts() {
        logger.info("Fetching all products");
        return productRepository.findAll();
    }

    public Product getProductById(Long id) {
        logger.info("Fetching product with id: {}", id);
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
    }

    public List<Product> searchByName(String name) {
        logger.info("Searching products with name containing: {}", name);
        return productRepository.findByNameContainingIgnoreCase(name);
    }

    public List<Product> findByPriceRange(BigDecimal min, BigDecimal max) {
        logger.info("Finding products with price between {} and {}", min, max);
        return productRepository.findByPriceBetween(min, max);
    }

    public List<Product> findInStock() {
        logger.info("Finding products in stock");
        return productRepository.findByStockQuantityGreaterThan(0);
    }

    @Transactional
    public Product createProduct(Product product) {
        logger.info("Creating new product: {}", product.getName());
        
        // Save to database first
        Product savedProduct = productRepository.save(product);
        logger.info("Product saved to database with ID: {}", savedProduct.getId());
        
        // Then save to S3
        s3Service.saveProductToS3(savedProduct);
        logger.info("Product also saved to S3");
        
        return savedProduct;
    }

    @Transactional
    public Product updateProduct(Long id, Product productDetails) {
        logger.info("Updating product with id: {}", id);
        
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));

        product.setName(productDetails.getName());
        product.setDescription(productDetails.getDescription());
        product.setPrice(productDetails.getPrice());
        product.setStockQuantity(productDetails.getStockQuantity());

        // Update in database
        Product updatedProduct = productRepository.save(product);
        logger.info("Product updated in database");
        
        // Update in S3
        s3Service.saveProductToS3(updatedProduct);
        logger.info("Product also updated in S3");
        
        return updatedProduct;
    }

    @Transactional
    public void deleteProduct(Long id) {
        logger.info("Deleting product with id: {}", id);
        
        // Check if product exists
        Optional<Product> product = productRepository.findById(id);
        if (!product.isPresent()) {
            throw new ResourceNotFoundException("Product not found with id: " + id);
        }
        
        // Delete from database
        productRepository.deleteById(id);
        logger.info("Product deleted from database");
        
        // Delete from S3
        s3Service.deleteProductFromS3(id);
        logger.info("Product also deleted from S3");
    }
}
