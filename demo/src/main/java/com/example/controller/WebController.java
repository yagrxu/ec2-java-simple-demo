package com.example.controller;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import com.example.model.Product;
import com.example.service.ProductService;

import jakarta.validation.Valid;

@Controller
public class WebController {

    private static final Logger logger = LoggerFactory.getLogger(WebController.class);
    
    private final ProductService productService;
    
    @Autowired
    public WebController(ProductService productService) {
        this.productService = productService;
    }
    
    @GetMapping("/")
    public String home(Model model) {
        logger.info("Displaying home page");
        return "redirect:/products";
    }
    
    @GetMapping("/products")
    public String getAllProducts(Model model) {
        logger.info("Displaying all products");
        List<Product> products = productService.getAllProducts();
        model.addAttribute("products", products);
        return "products";
    }
    
    @GetMapping("/products/new")
    public String showNewProductForm(Model model) {
        logger.info("Displaying new product form");
        model.addAttribute("product", new Product());
        return "product-form";
    }
    
    @PostMapping("/products/save")
    public String saveProduct(@Valid @ModelAttribute("product") Product product, 
                              BindingResult result, 
                              RedirectAttributes redirectAttributes) {
        logger.info("Saving product: {}", product.getName());
        
        if (result.hasErrors()) {
            logger.warn("Validation errors occurred: {}", result.getAllErrors());
            return "product-form";
        }
        
        // Set timestamps
        if (product.getId() == null) {
            product.setCreatedAt(LocalDateTime.now());
        }
        product.setUpdatedAt(LocalDateTime.now());
        
        try {
            Product savedProduct = productService.createProduct(product);
            redirectAttributes.addFlashAttribute("successMessage", 
                    "Product '" + savedProduct.getName() + "' saved successfully!");
        } catch (Exception e) {
            logger.error("Error saving product", e);
            redirectAttributes.addFlashAttribute("errorMessage", 
                    "Error saving product: " + e.getMessage());
        }
        
        return "redirect:/products";
    }
    
    @GetMapping("/products/edit/{id}")
    public String showEditProductForm(@PathVariable Long id, Model model, RedirectAttributes redirectAttributes) {
        logger.info("Displaying edit form for product id: {}", id);
        
        try {
            Product product = productService.getProductById(id);
            model.addAttribute("product", product);
            return "product-form";
        } catch (Exception e) {
            logger.error("Error finding product with id: {}", id, e);
            redirectAttributes.addFlashAttribute("errorMessage", 
                    "Product not found with id: " + id);
            return "redirect:/products";
        }
    }
    
    @GetMapping("/products/delete/{id}")
    public String deleteProduct(@PathVariable Long id, RedirectAttributes redirectAttributes) {
        logger.info("Deleting product with id: {}", id);
        
        try {
            productService.deleteProduct(id);
            redirectAttributes.addFlashAttribute("successMessage", 
                    "Product deleted successfully!");
        } catch (Exception e) {
            logger.error("Error deleting product with id: {}", id, e);
            redirectAttributes.addFlashAttribute("errorMessage", 
                    "Error deleting product: " + e.getMessage());
        }
        
        return "redirect:/products";
    }
    
    @GetMapping("/products/search")
    public String searchProducts(@RequestParam String name, Model model) {
        logger.info("Searching products with name containing: {}", name);
        List<Product> products = productService.searchByName(name);
        model.addAttribute("products", products);
        model.addAttribute("searchTerm", name);
        return "products";
    }
    
    @GetMapping("/products/price-range")
    public String getProductsByPriceRange(@RequestParam BigDecimal min, 
                                         @RequestParam BigDecimal max, 
                                         Model model) {
        logger.info("Finding products with price between {} and {}", min, max);
        List<Product> products = productService.findByPriceRange(min, max);
        model.addAttribute("products", products);
        model.addAttribute("minPrice", min);
        model.addAttribute("maxPrice", max);
        return "products";
    }
    
    @GetMapping("/products/in-stock")
    public String getProductsInStock(Model model) {
        logger.info("Finding products in stock");
        List<Product> products = productService.findInStock();
        model.addAttribute("products", products);
        model.addAttribute("inStockOnly", true);
        return "products";
    }
}
