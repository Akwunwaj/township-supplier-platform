
INSERT INTO users (phone,email,password_hash,role) VALUES
 ('+27000000011','supplier1@example.com','$2b$12$rjzI8nJ6e1ZK2q5lNVu5/.Qm2X9x8p8zTz5x2f5tS1vCHXyqK7pNm','supplier') ON CONFLICT DO NOTHING,
 ('+27000000001','retailer1@example.com','$2b$12$rjzI8nJ6e1ZK2q5lNVu5/.Qm2X9x8p8zTz5x2f5tS1vCHXyqK7pNm','retailer') ON CONFLICT DO NOTHING,
 ('+27000000021','driver1@example.com','$2b$12$rjzI8nJ6e1ZK2q5lNVu5/.Qm2X9x8p8zTz5x2f5tS1vCHXyqK7pNm','driver') ON CONFLICT DO NOTHING,
 ('+27000000099','admin@example.com','$2b$12$rjzI8nJ6e1ZK2q5lNVu5/.Qm2X9x8p8zTz5x2f5tS1vCHXyqK7pNm','admin') ON CONFLICT DO NOTHING;

INSERT INTO wallets (user_id, balance, currency)
SELECT id, 500.00, 'ZAR' FROM users WHERE role IN ('retailer','supplier') ON CONFLICT DO NOTHING;
