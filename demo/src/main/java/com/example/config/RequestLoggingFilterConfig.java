package com.example.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.CommonsRequestLoggingFilter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Configuration for request logging
 * This class configures a request logging filter and an interceptor to log all incoming requests
 * and their processing time
 */
@Configuration
public class RequestLoggingFilterConfig implements WebMvcConfigurer {
    
    private static final Logger logger = LoggerFactory.getLogger(RequestLoggingFilterConfig.class);
    
    /**
     * Configure the CommonsRequestLoggingFilter to log request details
     */
    @Bean
    public CommonsRequestLoggingFilter requestLoggingFilter() {
        CommonsRequestLoggingFilter filter = new CommonsRequestLoggingFilter();
        filter.setIncludeQueryString(true);
        filter.setIncludePayload(true);
        filter.setMaxPayloadLength(10000);
        filter.setIncludeHeaders(true);
        filter.setAfterMessagePrefix("REQUEST DATA: ");
        return filter;
    }
    
    /**
     * Add a custom interceptor to log request processing time
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new RequestProcessingTimeInterceptor());
    }
    
    /**
     * Custom interceptor to log request processing time
     */
    public class RequestProcessingTimeInterceptor implements HandlerInterceptor {
        
        private ThreadLocal<Long> startTimeThreadLocal = new ThreadLocal<>();
        
        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            long startTime = System.currentTimeMillis();
            startTimeThreadLocal.set(startTime);
            logger.info("Request URL: {} started at {}", request.getRequestURL(), startTime);
            return true;
        }
        
        @Override
        public void afterCompletion(HttpServletRequest request, HttpServletResponse response, 
                                   Object handler, Exception ex) {
            long startTime = startTimeThreadLocal.get();
            long endTime = System.currentTimeMillis();
            long processingTime = endTime - startTime;
            
            logger.info("Request URL: {} | Status: {} | Time Taken: {} ms", 
                      request.getRequestURL(), response.getStatus(), processingTime);
            
            if (ex != null) {
                logger.error("Request URL: {} | Exception: {}", request.getRequestURL(), ex.getMessage(), ex);
            }
            
            startTimeThreadLocal.remove();
        }
    }
}
