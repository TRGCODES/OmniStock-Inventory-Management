-- ============================================================
--  OmniStock — Database Schema
--  DBMS Mini Project | Full Implementation
-- ============================================================

CREATE DATABASE IF NOT EXISTS omnistock;
USE omnistock;

-- ============================================================
--  TABLE DEFINITIONS (DDL)
--  All constraints defined inline — no scattered ALTERs
-- ============================================================

-- 1. Role
CREATE TABLE Role (
    Role_Id   INT          PRIMARY KEY,
    Role_Name VARCHAR(100) NOT NULL
);

-- 2. Category
CREATE TABLE Category (
    Category_Id   INT          PRIMARY KEY,
    Category_Name VARCHAR(255) NOT NULL,
    CONSTRAINT uq_category_name UNIQUE (Category_Name)
);

-- 3. User  (secure_key + Status included from the start)
CREATE TABLE User (
    User_Id    INT          PRIMARY KEY,
    User_Name  VARCHAR(255) NOT NULL,
    Password   VARCHAR(255) NOT NULL,
    Role_Id    INT          NOT NULL,
    Status     VARCHAR(20)  NOT NULL DEFAULT 'Active',
    secure_key VARCHAR(255) NOT NULL,
    CONSTRAINT uq_user_name UNIQUE (User_Name),
    CONSTRAINT fk_user_role FOREIGN KEY (Role_Id) REFERENCES Role(Role_Id),
    CONSTRAINT chk_user_status CHECK (Status IN ('Active','Inactive'))
);

-- 4. Product
CREATE TABLE Product (
    Product_Id   INT            PRIMARY KEY,
    Product_Name VARCHAR(255)   NOT NULL,
    Unit_Price   DECIMAL(10,2)  NOT NULL,
    Stock_Level  INT            NOT NULL DEFAULT 0,
    Reorder_Point INT           NOT NULL DEFAULT 10,
    Category_Id  INT            NOT NULL,
    CONSTRAINT fk_product_category FOREIGN KEY (Category_Id) REFERENCES Category(Category_Id),
    CONSTRAINT chk_unit_price    CHECK (Unit_Price   >  0),
    CONSTRAINT chk_stock_level   CHECK (Stock_Level  >= 0),
    CONSTRAINT chk_reorder_point CHECK (Reorder_Point >= 0)
);

-- 5. Supplier
CREATE TABLE Supplier (
    Supplier_Id    INT          PRIMARY KEY,
    Supplier_Name  VARCHAR(255) NOT NULL,
    Contact_Person VARCHAR(255),
    Phone          VARCHAR(20)
);

-- 6. Purchase_Record
CREATE TABLE Purchase_Record (
    Purchase_Id   INT  PRIMARY KEY,
    Purchase_Date DATE NOT NULL,
    Quantity      INT  NOT NULL,
    Product_Id    INT  NOT NULL,
    Supplier_Id   INT  NOT NULL,
    User_Id       INT  NOT NULL,
    CONSTRAINT fk_purchase_product  FOREIGN KEY (Product_Id)  REFERENCES Product(Product_Id),
    CONSTRAINT fk_purchase_supplier FOREIGN KEY (Supplier_Id) REFERENCES Supplier(Supplier_Id),
    CONSTRAINT fk_purchase_user     FOREIGN KEY (User_Id)     REFERENCES User(User_Id),
    CONSTRAINT chk_purchase_qty     CHECK (Quantity > 0)
);

-- 7. Sale_Record
CREATE TABLE Sale_Record (
    Sale_Id      INT           PRIMARY KEY,
    Sale_Date    DATE          NOT NULL,
    Total_Amount DECIMAL(10,2) NOT NULL,
    Quantity     INT           NOT NULL,
    Product_Id   INT           NOT NULL,
    User_Id      INT           NOT NULL,
    CONSTRAINT fk_sale_product FOREIGN KEY (Product_Id) REFERENCES Product(Product_Id),
    CONSTRAINT fk_sale_user    FOREIGN KEY (User_Id)    REFERENCES User(User_Id),
    CONSTRAINT chk_sale_qty    CHECK (Quantity     >  0),
    CONSTRAINT chk_sale_amt    CHECK (Total_Amount >  0)
);


-- ============================================================
--  SEED DATA (DML — INSERT)
-- ============================================================

INSERT INTO Role VALUES
    (1, 'Admin'),
    (2, 'Manager'),
    (3, 'Sales Officer'),
    (4, 'Purchase Officer');   -- fixed typo: "Purchae" → "Purchase"

INSERT INTO User (User_Id, User_Name, Password, Role_Id, Status, secure_key) VALUES
    (1, 'Rishabh',  'RishabhG@447!',  1, 'Active', 'OMNI-1234');

-- ============================================================
--  VIEWS
--  Stored named queries — evaluated at runtime
-- ============================================================

-- View 1: Stock Status — shows each product's live stock & alert level
CREATE OR REPLACE VIEW vw_StockStatus AS
SELECT
    p.Product_Id,
    p.Product_Name,
    c.Category_Name,
    p.Unit_Price,
    p.Stock_Level,
    p.Reorder_Point,
    ROUND(p.Unit_Price * p.Stock_Level, 2)  AS Stock_Value,
    CASE
        WHEN p.Stock_Level  = 0                  THEN 'Critical'
        WHEN p.Stock_Level <= p.Reorder_Point     THEN 'Low Stock'
        ELSE                                           'Normal'
    END AS Stock_Status
FROM Product p
JOIN Category c ON p.Category_Id = c.Category_Id;

-- View 2: Sales Summary — revenue & units sold per product
CREATE OR REPLACE VIEW vw_SalesSummary AS
SELECT
    p.Product_Id,
    p.Product_Name,
    c.Category_Name,
    COUNT(sr.Sale_Id)         AS Total_Transactions,
    COALESCE(SUM(sr.Quantity), 0)      AS Total_Qty_Sold,
    COALESCE(SUM(sr.Total_Amount), 0)  AS Total_Revenue
FROM Product p
LEFT JOIN Sale_Record sr ON p.Product_Id = sr.Product_Id
JOIN      Category    c  ON p.Category_Id = c.Category_Id
GROUP BY p.Product_Id, p.Product_Name, c.Category_Name;

-- View 3: Purchase Details — full purchase history with supplier & recorder
CREATE OR REPLACE VIEW vw_PurchaseDetails AS
SELECT
    pr.Purchase_Id,
    pr.Purchase_Date,
    p.Product_Name,
    c.Category_Name,
    s.Supplier_Name,
    s.Phone             AS Supplier_Phone,
    pr.Quantity,
    u.User_Name         AS Recorded_By,
    r.Role_Name         AS Recorder_Role
FROM Purchase_Record pr
JOIN Product  p ON pr.Product_Id  = p.Product_Id
JOIN Category c ON p.Category_Id  = c.Category_Id
JOIN Supplier s ON pr.Supplier_Id = s.Supplier_Id
JOIN User     u ON pr.User_Id     = u.User_Id
JOIN Role     r ON u.Role_Id      = r.Role_Id;

-- Querying the views:
SELECT * FROM vw_StockStatus      ORDER BY Stock_Status, Product_Name;
SELECT * FROM vw_SalesSummary     ORDER BY Total_Revenue DESC;
SELECT * FROM vw_PurchaseDetails  ORDER BY Purchase_Date DESC;


-- ============================================================
--  TRIGGERS
--  Automatic actions fired on INSERT / DELETE
-- ============================================================

DELIMITER $$

-- Trigger 1 (BEFORE INSERT on Sale_Record)
--   Prevents a sale from going through if stock is insufficient
CREATE TRIGGER trg_BeforeSaleInsert
BEFORE INSERT ON Sale_Record
FOR EACH ROW
BEGIN
    DECLARE v_stock INT;
    SELECT Stock_Level INTO v_stock
    FROM   Product
    WHERE  Product_Id = NEW.Product_Id;

    IF v_stock IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Product not found';
    END IF;

    IF v_stock < NEW.Quantity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient stock — sale rejected by database trigger';
    END IF;
END$$

-- Trigger 2 (AFTER INSERT on Sale_Record)
--   Auto-deducts stock after a sale row is committed
CREATE TRIGGER trg_AfterSaleInsert
AFTER INSERT ON Sale_Record
FOR EACH ROW
BEGIN
    UPDATE Product
    SET    Stock_Level = Stock_Level - NEW.Quantity
    WHERE  Product_Id  = NEW.Product_Id;
END$$

-- Trigger 3 (AFTER INSERT on Purchase_Record)
--   Auto-increases stock after a purchase row is committed
CREATE TRIGGER trg_AfterPurchaseInsert
AFTER INSERT ON Purchase_Record
FOR EACH ROW
BEGIN
    UPDATE Product
    SET    Stock_Level = Stock_Level + NEW.Quantity
    WHERE  Product_Id  = NEW.Product_Id;
END$$

-- Trigger 4 (AFTER DELETE on Sale_Record)
--   Restores stock when a sale record is deleted
CREATE TRIGGER trg_AfterSaleDelete
AFTER DELETE ON Sale_Record
FOR EACH ROW
BEGIN
    UPDATE Product
    SET    Stock_Level = Stock_Level + OLD.Quantity
    WHERE  Product_Id  = OLD.Product_Id;
END$$

-- Trigger 5 (AFTER DELETE on Purchase_Record)
--   Reverses stock when a purchase record is deleted
CREATE TRIGGER trg_AfterPurchaseDelete
AFTER DELETE ON Purchase_Record
FOR EACH ROW
BEGIN
    UPDATE Product
    SET    Stock_Level = GREATEST(0, Stock_Level - OLD.Quantity)
    WHERE  Product_Id  = OLD.Product_Id;
END$$

DELIMITER ;


-- ============================================================
--  TRANSACTIONS
--  Atomic multi-step operations with COMMIT / ROLLBACK
-- ============================================================

-- Transaction 1: Record a sale atomically
--   If either the INSERT or the UPDATE fails, nothing is committed
START TRANSACTION;
    INSERT INTO Sale_Record (Sale_Id, Sale_Date, Total_Amount, Quantity, Product_Id, User_Id)
    VALUES (6, '2025-03-01', 3400.00, 4, 9, 3);

    -- Stock deduction (mirrors what the trigger also does — shown here for demonstration)
    UPDATE Product
    SET    Stock_Level = Stock_Level - 4
    WHERE  Product_Id  = 9;
COMMIT;

-- Transaction 2: Record a purchase atomically
START TRANSACTION;
    INSERT INTO Purchase_Record (Purchase_Id, Purchase_Date, Quantity, Product_Id, Supplier_Id, User_Id)
    VALUES (6, '2025-03-02', 100, 5, 2, 4);

    UPDATE Product
    SET    Stock_Level = Stock_Level + 100
    WHERE  Product_Id  = 5;
COMMIT;

-- Transaction 3: Demonstrate ROLLBACK — a bad sale is safely aborted
START TRANSACTION;
    -- Attempt to sell 9999 units (will violate CHECK / trigger, or we can manually rollback)
    INSERT INTO Sale_Record (Sale_Id, Sale_Date, Total_Amount, Quantity, Product_Id, User_Id)
    VALUES (99, '2025-03-03', 999.00, 9999, 10, 3);
ROLLBACK;   -- No change is made to the database

-- Transaction 4: Transfer stock correction (adjust two products in one atomic step)
START TRANSACTION;
    UPDATE Product SET Stock_Level = Stock_Level + 5  WHERE Product_Id = 7;
    UPDATE Product SET Stock_Level = Stock_Level - 3  WHERE Product_Id = 8;
COMMIT;


-- ============================================================
--  ANALYTICAL SQL QUERIES
--  Joins, aggregates, GROUP BY, HAVING, subqueries
-- ============================================================

-- Q1: Top-selling products by revenue
SELECT
    p.Product_Name,
    c.Category_Name,
    SUM(sr.Quantity)     AS Units_Sold,
    SUM(sr.Total_Amount) AS Total_Revenue
FROM Sale_Record sr
JOIN Product  p ON sr.Product_Id  = p.Product_Id
JOIN Category c ON p.Category_Id  = c.Category_Id
GROUP BY p.Product_Id, p.Product_Name, c.Category_Name
ORDER BY Total_Revenue DESC;

-- Q2: Suppliers with more than 1 purchase order
SELECT
    s.Supplier_Name,
    s.Contact_Person,
    COUNT(pr.Purchase_Id) AS Total_Orders,
    SUM(pr.Quantity)      AS Total_Units_Supplied
FROM Purchase_Record pr
JOIN Supplier s ON pr.Supplier_Id = s.Supplier_Id
GROUP BY s.Supplier_Id, s.Supplier_Name, s.Contact_Person
HAVING COUNT(pr.Purchase_Id) > 1
ORDER BY Total_Orders DESC;

-- Q3: Products below their reorder point (low/critical stock alert)
SELECT
    Product_Id,
    Product_Name,
    Stock_Level,
    Reorder_Point,
    (Reorder_Point - Stock_Level) AS Deficit
FROM Product
WHERE Stock_Level <= Reorder_Point
ORDER BY Deficit DESC;

-- Q4: Monthly sales summary
SELECT
    DATE_FORMAT(Sale_Date, '%Y-%m') AS Month,
    COUNT(Sale_Id)                  AS Number_Of_Sales,
    SUM(Quantity)                   AS Total_Units,
    SUM(Total_Amount)               AS Monthly_Revenue
FROM Sale_Record
GROUP BY DATE_FORMAT(Sale_Date, '%Y-%m')
ORDER BY Month DESC;

-- Q5: Category-wise inventory value
SELECT
    c.Category_Name,
    COUNT(p.Product_Id)                            AS Product_Count,
    SUM(p.Stock_Level)                             AS Total_Units,
    SUM(p.Unit_Price * p.Stock_Level)              AS Inventory_Value,
    AVG(p.Unit_Price)                              AS Avg_Unit_Price
FROM Product  p
JOIN Category c ON p.Category_Id = c.Category_Id
GROUP BY c.Category_Id, c.Category_Name
ORDER BY Inventory_Value DESC;

-- Q6: Users and their transaction activity (multi-table join)
SELECT
    u.User_Name,
    r.Role_Name,
    COUNT(DISTINCT sr.Sale_Id)     AS Sales_Made,
    COUNT(DISTINCT pr.Purchase_Id) AS Purchases_Made
FROM User u
JOIN Role r ON u.Role_Id = r.Role_Id
LEFT JOIN Sale_Record     sr ON u.User_Id = sr.User_Id
LEFT JOIN Purchase_Record pr ON u.User_Id = pr.User_Id
GROUP BY u.User_Id, u.User_Name, r.Role_Name
ORDER BY u.User_Id;

-- Q7: Products never sold (LEFT JOIN with NULL check)
SELECT p.Product_Id, p.Product_Name, p.Stock_Level
FROM Product p
LEFT JOIN Sale_Record sr ON p.Product_Id = sr.Product_Id
WHERE sr.Sale_Id IS NULL;

-- Q8: Most active supplier (subquery)
SELECT Supplier_Name, Contact_Person, Phone
FROM   Supplier
WHERE  Supplier_Id = (
    SELECT   Supplier_Id
    FROM     Purchase_Record
    GROUP BY Supplier_Id
    ORDER BY COUNT(*) DESC
    LIMIT 1
);