-- Insert sample products if they don't exist
INSERT INTO products (name, description, price, stock_quantity, created_at, updated_at)
SELECT 'Laptop', 'High-performance laptop with 16GB RAM', 1299.99, 10, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Laptop');

INSERT INTO products (name, description, price, stock_quantity, created_at, updated_at)
SELECT 'Smartphone', 'Latest model with 128GB storage', 899.99, 15, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Smartphone');

INSERT INTO products (name, description, price, stock_quantity, created_at, updated_at)
SELECT 'Headphones', 'Noise-cancelling wireless headphones', 249.99, 20, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Headphones');

INSERT INTO products (name, description, price, stock_quantity, created_at, updated_at)
SELECT 'Tablet', '10-inch tablet with retina display', 499.99, 8, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Tablet');

INSERT INTO products (name, description, price, stock_quantity, created_at, updated_at)
SELECT 'Smartwatch', 'Fitness tracking and notifications', 199.99, 12, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Smartwatch');
