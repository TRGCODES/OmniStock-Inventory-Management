const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── DB Connection ──────────────────────────────────────────────
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "RishabhGMySQL@447!",
  database: "omnistock",
});

db.connect((err) => {
  if (err) {
    console.error("MySQL Connection Failed:", err);
    return;
  }
  console.log("✅ MySQL Connected");
});

// Helper: run a single query as a promise
const q = (sql, params = []) =>
  new Promise((res, rej) =>
    db.execute(sql, params, (err, rows) => (err ? rej(err) : res(rows))),
  );

// Transaction helpers
const beginTxn = () =>
  new Promise((res, rej) =>
    db.beginTransaction((err) => (err ? rej(err) : res())),
  );
const commit = () =>
  new Promise((res, rej) => db.commit((err) => (err ? rej(err) : res())));
const rollback = () => new Promise((res) => db.rollback(() => res()));

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

// POST /login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Username and password required" });
  try {
    const rows = await q(
      `SELECT u.User_Id, u.User_Name, r.Role_Name, u.Status
       FROM User u JOIN Role r ON u.Role_Id = r.Role_Id
       WHERE u.User_Name = ? AND u.Password = ?`,
      [username, password],
    );
    if (!rows.length)
      return res.status(401).json({ message: "Invalid credentials" });
    const user = rows[0];
    if (user.Status !== "Active")
      return res.status(403).json({ message: "Account inactive" });
    res.json({
      message: "Login successful",
      user_id: user.User_Id,
      username: user.User_Name,
      role: user.Role_Name,
    });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// POST /reset-password
app.post("/reset-password", async (req, res) => {
  const { username, secure_key, new_password } = req.body;
  if (!username || !secure_key || !new_password)
    return res.status(400).json({ message: "All fields are required" });
  try {
    const rows = await q(
      "SELECT * FROM User WHERE User_Name = ? AND secure_key = ?",
      [username, secure_key],
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ message: "User not found or incorrect secure key" });
    await q("UPDATE User SET Password = ? WHERE User_Name = ?", [
      new_password,
      username,
    ]);
    res.json({ message: "Password changed successfully" });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// ══════════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════════

// GET /users
app.get("/users", async (req, res) => {
  try {
    const rows = await q(
      `SELECT u.User_Id as user_id, u.User_Name as user_name, u.Role_Id as role_id,
              r.Role_Name as role_name, u.secure_key, u.Status as status
       FROM User u JOIN Role r ON u.Role_Id = r.Role_Id
       ORDER BY u.User_Id ASC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// POST /users  — add user
app.post("/users", async (req, res) => {
  const { user_name, password, role_id, secure_key, status } = req.body;
  if (!user_name || !password || !role_id || !secure_key)
    return res.status(400).json({
      message: "Username, password, role and secure key are required",
    });
  try {
    // get next id
    const idRows = await q(
      "SELECT COALESCE(MAX(User_Id),0)+1 AS next_id FROM User",
    );
    const next_id = idRows[0].next_id;
    await q(
      "INSERT INTO User (User_Id, User_Name, Password, Role_Id, secure_key, Status) VALUES (?,?,?,?,?,?)",
      [next_id, user_name, password, role_id, secure_key, status || "Active"],
    );
    res.json({ message: "User added", user_id: next_id });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Username already exists" });
    res.status(500).json({ message: "Database error" });
  }
});

// PUT /users/:id  — edit user
app.put("/users/:id", async (req, res) => {
  const { user_name, password, role_id, secure_key, status } = req.body;
  const id = parseInt(req.params.id);
  try {
    if (password) {
      await q(
        "UPDATE User SET User_Name=?, Password=?, Role_Id=?, secure_key=?, Status=? WHERE User_Id=?",
        [user_name, password, role_id, secure_key, status, id],
      );
    } else {
      await q(
        "UPDATE User SET User_Name=?, Role_Id=?, secure_key=?, Status=? WHERE User_Id=?",
        [user_name, role_id, secure_key, status, id],
      );
    }
    res.json({ message: "User updated" });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /users/:id
app.delete("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Check for linked sale or purchase records
    const [sales, purchases] = await Promise.all([
      q("SELECT COUNT(*) as cnt FROM Sale_Record WHERE User_Id=?", [id]),
      q("SELECT COUNT(*) as cnt FROM Purchase_Record WHERE User_Id=?", [id]),
    ]);
    if (sales[0].cnt > 0 || purchases[0].cnt > 0)
      return res.status(409).json({
        message: `Cannot delete user — they have ${sales[0].cnt} sale(s) and ${purchases[0].cnt} purchase(s) linked to their account. Remove those records first.`,
      });
    const result = await q("DELETE FROM User WHERE User_Id=?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (e) {
    console.error("DELETE /users/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  PRODUCTS
// ══════════════════════════════════════════════════════════════

// GET /products
app.get("/products", async (req, res) => {
  try {
    const rows = await q(
      `SELECT p.Product_Id as product_id, p.Product_Name as product_name,
              p.Unit_Price as unit_price, p.Stock_Level as stock_level,
              p.Reorder_Point as reorder_point, p.Category_Id as category_id,
              c.Category_Name as category_name
       FROM Product p LEFT JOIN Category c ON p.Category_Id = c.Category_Id
       ORDER BY p.Product_Id ASC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// POST /products
app.post("/products", async (req, res) => {
  const { product_name, unit_price, stock_level, reorder_point, category_id } =
    req.body;
  if (!product_name || !unit_price || unit_price <= 0)
    return res
      .status(400)
      .json({ message: "Product name and valid price are required" });
  try {
    const idRows = await q(
      "SELECT COALESCE(MAX(Product_Id),0)+1 AS next_id FROM Product",
    );
    const next_id = idRows[0].next_id;
    await q(
      "INSERT INTO Product (Product_Id, Product_Name, Unit_Price, Stock_Level, Reorder_Point, Category_Id) VALUES (?,?,?,?,?,?)",
      [
        next_id,
        product_name,
        unit_price,
        stock_level || 0,
        reorder_point || 10,
        category_id || 1,
      ],
    );
    res.json({ message: "Product added", product_id: next_id });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// PUT /products/:id  — update stock (and optionally other fields)
app.put("/products/:id", async (req, res) => {
  const { product_name, unit_price, stock_level, reorder_point, category_id } =
    req.body;
  const id = parseInt(req.params.id);
  try {
    await q(
      "UPDATE Product SET Product_Name=?, Unit_Price=?, Stock_Level=?, Reorder_Point=?, Category_Id=? WHERE Product_Id=?",
      [product_name, unit_price, stock_level, reorder_point, category_id, id],
    );
    res.json({ message: "Product updated" });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /products/:id
app.delete("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [sales, purchases] = await Promise.all([
      q("SELECT COUNT(*) as cnt FROM Sale_Record WHERE Product_Id=?", [id]),
      q("SELECT COUNT(*) as cnt FROM Purchase_Record WHERE Product_Id=?", [id]),
    ]);
    if (sales[0].cnt > 0 || purchases[0].cnt > 0)
      return res.status(409).json({
        message: `Cannot delete product — it has ${sales[0].cnt} sale(s) and ${purchases[0].cnt} purchase record(s) linked to it. Remove those records first.`,
      });
    const result = await q("DELETE FROM Product WHERE Product_Id=?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (e) {
    console.error("DELETE /products/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  CATEGORIES
// ══════════════════════════════════════════════════════════════

// GET /categories
app.get("/categories", async (req, res) => {
  try {
    const rows = await q(
      "SELECT Category_Id as category_id, Category_Name as category_name FROM Category ORDER BY Category_Id ASC",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// POST /categories
app.post("/categories", async (req, res) => {
  const { category_name } = req.body;
  if (!category_name)
    return res.status(400).json({ message: "Category name required" });
  try {
    const idRows = await q(
      "SELECT COALESCE(MAX(Category_Id),0)+1 AS next_id FROM Category",
    );
    const next_id = idRows[0].next_id;
    await q("INSERT INTO Category (Category_Id, Category_Name) VALUES (?,?)", [
      next_id,
      category_name,
    ]);
    res.json({ message: "Category added", category_id: next_id });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /categories/:id
app.delete("/categories/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const linked = await q(
      "SELECT COUNT(*) as cnt FROM Product WHERE Category_Id=?",
      [id],
    );
    if (linked[0].cnt > 0)
      return res.status(409).json({
        message: `Cannot delete category — ${linked[0].cnt} product(s) are assigned to it. Reassign or delete those products first.`,
      });
    const result = await q("DELETE FROM Category WHERE Category_Id=?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (e) {
    console.error("DELETE /categories/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  SUPPLIERS
// ══════════════════════════════════════════════════════════════

// GET /suppliers
app.get("/suppliers", async (req, res) => {
  try {
    const rows = await q(
      `SELECT s.Supplier_Id as supplier_id, s.Supplier_Name as supplier_name,
              s.Contact_Person as contact_person, s.Phone as phone,
              COUNT(pr.Purchase_Id) as order_count
       FROM Supplier s
       LEFT JOIN Purchase_Record pr ON s.Supplier_Id = pr.Supplier_Id
       GROUP BY s.Supplier_Id
       ORDER BY s.Supplier_Id ASC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// POST /suppliers
app.post("/suppliers", async (req, res) => {
  const { supplier_name, contact_person, phone } = req.body;
  if (!supplier_name)
    return res.status(400).json({ message: "Supplier name required" });
  try {
    const idRows = await q(
      "SELECT COALESCE(MAX(Supplier_Id),0)+1 AS next_id FROM Supplier",
    );
    const next_id = idRows[0].next_id;
    await q(
      "INSERT INTO Supplier (Supplier_Id, Supplier_Name, Contact_Person, Phone) VALUES (?,?,?,?)",
      [next_id, supplier_name, contact_person || null, phone || null],
    );
    res.json({ message: "Supplier added", supplier_id: next_id });
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /suppliers/:id
app.delete("/suppliers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const linked = await q(
      "SELECT COUNT(*) as cnt FROM Purchase_Record WHERE Supplier_Id=?",
      [id],
    );
    if (linked[0].cnt > 0)
      return res.status(409).json({
        message: `Cannot delete supplier — they have ${linked[0].cnt} purchase record(s) linked. Remove those records first.`,
      });
    const result = await q("DELETE FROM Supplier WHERE Supplier_Id=?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Supplier not found" });
    res.json({ message: "Supplier deleted" });
  } catch (e) {
    console.error("DELETE /suppliers/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  SALE RECORDS
// ══════════════════════════════════════════════════════════════

// GET /sales
app.get("/sales", async (req, res) => {
  try {
    const rows = await q(
      `SELECT sr.Sale_Id as sale_id, sr.Sale_Date as sale_date,
              sr.Total_Amount as total_amount, sr.Quantity as quantity,
              sr.Product_Id as product_id, sr.User_Id as user_id,
              p.Product_Name as product_name,
              u.User_Name as user_name
       FROM Sale_Record sr
       LEFT JOIN Product p ON sr.Product_Id = p.Product_Id
       LEFT JOIN User u ON sr.User_Id = u.User_Id
       ORDER BY sr.Sale_Id DESC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /sales/:id — removes the sale and restores stock
app.delete("/sales/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Fetch the sale first so we can reverse the stock deduction
    const rows = await q(
      "SELECT Product_Id, Quantity FROM Sale_Record WHERE Sale_Id=?",
      [id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Sale record not found" });
    const { Product_Id, Quantity } = rows[0];
    await q("DELETE FROM Sale_Record WHERE Sale_Id=?", [id]);
    // Restore stock
    await q(
      "UPDATE Product SET Stock_Level = Stock_Level + ? WHERE Product_Id=?",
      [Quantity, Product_Id],
    );
    res.json({ message: "Sale record deleted and stock restored" });
  } catch (e) {
    console.error("DELETE /sales/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  PURCHASE RECORDS
// ══════════════════════════════════════════════════════════════

// GET /purchases
app.get("/purchases", async (req, res) => {
  try {
    const rows = await q(
      `SELECT pr.Purchase_Id as purchase_id, pr.Purchase_Date as purchase_date,
              pr.Quantity as quantity, pr.Product_Id as product_id,
              pr.Supplier_Id as supplier_id, pr.User_Id as user_id,
              p.Product_Name as product_name, s.Supplier_Name as supplier_name,
              u.User_Name as user_name
       FROM Purchase_Record pr
       LEFT JOIN Product p ON pr.Product_Id = p.Product_Id
       LEFT JOIN Supplier s ON pr.Supplier_Id = s.Supplier_Id
       LEFT JOIN User u ON pr.User_Id = u.User_Id
       ORDER BY pr.Purchase_Id DESC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error" });
  }
});

// DELETE /purchases/:id — removes the purchase and reverses stock addition
app.delete("/purchases/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Fetch the purchase first so we can reverse the stock addition
    const rows = await q(
      "SELECT Product_Id, Quantity FROM Purchase_Record WHERE Purchase_Id=?",
      [id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Purchase record not found" });
    const { Product_Id, Quantity } = rows[0];
    // Check stock won't go negative
    const stockRows = await q(
      "SELECT Stock_Level FROM Product WHERE Product_Id=?",
      [Product_Id],
    );
    if (stockRows.length && stockRows[0].Stock_Level < Quantity)
      return res.status(409).json({
        message: `Cannot delete purchase — reversing it would make stock negative (current stock: ${stockRows[0].Stock_Level}, purchase qty: ${Quantity}).`,
      });
    await q("DELETE FROM Purchase_Record WHERE Purchase_Id=?", [id]);
    // Reverse stock
    await q(
      "UPDATE Product SET Stock_Level = Stock_Level - ? WHERE Product_Id=?",
      [Quantity, Product_Id],
    );
    res.json({ message: "Purchase record deleted and stock reversed" });
  } catch (e) {
    console.error("DELETE /purchases/:id", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// POST /sales  — record a sale and deduct stock (wrapped in a transaction)
app.post("/sales", async (req, res) => {
  const { sale_date, total_amount, quantity, product_id, user_id } = req.body;
  if (!sale_date || !quantity || !product_id || !user_id || quantity < 1)
    return res.status(400).json({ message: "Missing required fields" });
  if (!total_amount || total_amount <= 0)
    return res
      .status(400)
      .json({ message: "Total amount must be greater than 0" });

  await beginTxn();
  try {
    // Check stock availability inside the transaction (prevents race conditions)
    const stockRows = await q(
      "SELECT Stock_Level FROM Product WHERE Product_Id = ? FOR UPDATE",
      [product_id],
    );
    if (!stockRows.length) {
      await rollback();
      return res.status(404).json({ message: "Product not found" });
    }
    const currentStock = stockRows[0].Stock_Level;
    if (quantity > currentStock) {
      await rollback();
      return res.status(400).json({
        message: `Insufficient stock. Only ${currentStock} unit(s) available.`,
      });
    }

    const idRows = await q(
      "SELECT COALESCE(MAX(Sale_Id),0)+1 AS next_id FROM Sale_Record",
    );
    const next_id = idRows[0].next_id;

    await q(
      "INSERT INTO Sale_Record (Sale_Id, Sale_Date, Total_Amount, Quantity, Product_Id, User_Id) VALUES (?,?,?,?,?,?)",
      [next_id, sale_date, total_amount, quantity, product_id, user_id],
    );

    // Deduct stock atomically with the INSERT above
    await q(
      "UPDATE Product SET Stock_Level = Stock_Level - ? WHERE Product_Id = ?",
      [quantity, product_id],
    );

    await commit();
    res.json({ message: "Sale recorded", sale_id: next_id });
  } catch (e) {
    await rollback();
    console.error("POST /sales", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// POST /purchases  — record a purchase and add stock (wrapped in a transaction)
app.post("/purchases", async (req, res) => {
  const { purchase_date, quantity, product_id, supplier_id, user_id } =
    req.body;
  if (
    !purchase_date ||
    !quantity ||
    !product_id ||
    !supplier_id ||
    !user_id ||
    quantity < 1
  )
    return res.status(400).json({ message: "Missing required fields" });

  await beginTxn();
  try {
    // Verify product exists inside the transaction
    const prodRows = await q(
      "SELECT Product_Id FROM Product WHERE Product_Id = ? FOR UPDATE",
      [product_id],
    );
    if (!prodRows.length) {
      await rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    const idRows = await q(
      "SELECT COALESCE(MAX(Purchase_Id),0)+1 AS next_id FROM Purchase_Record",
    );
    const next_id = idRows[0].next_id;

    await q(
      "INSERT INTO Purchase_Record (Purchase_Id, Purchase_Date, Quantity, Product_Id, Supplier_Id, User_Id) VALUES (?,?,?,?,?,?)",
      [next_id, purchase_date, quantity, product_id, supplier_id, user_id],
    );

    // Increase stock atomically with the INSERT above
    await q(
      "UPDATE Product SET Stock_Level = Stock_Level + ? WHERE Product_Id = ?",
      [quantity, product_id],
    );

    await commit();
    res.json({ message: "Purchase recorded", purchase_id: next_id });
  } catch (e) {
    await rollback();
    console.error("POST /purchases", e);
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ANALYTICS  (powered by database views)
// ══════════════════════════════════════════════════════════════

// GET /analytics/stock-status  — vw_StockStatus
app.get("/analytics/stock-status", async (req, res) => {
  try {
    const rows = await q(
      "SELECT * FROM vw_StockStatus ORDER BY Stock_Status, Product_Name",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// GET /analytics/sales-summary  — vw_SalesSummary
app.get("/analytics/sales-summary", async (req, res) => {
  try {
    const rows = await q(
      "SELECT * FROM vw_SalesSummary ORDER BY Total_Revenue DESC",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// GET /analytics/purchase-details  — vw_PurchaseDetails
app.get("/analytics/purchase-details", async (req, res) => {
  try {
    const rows = await q(
      "SELECT * FROM vw_PurchaseDetails ORDER BY Purchase_Date DESC",
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// GET /analytics/category-summary  — category-wise inventory value
app.get("/analytics/category-summary", async (req, res) => {
  try {
    const rows = await q(`
      SELECT c.Category_Name,
             COUNT(p.Product_Id)                       AS Product_Count,
             COALESCE(SUM(p.Stock_Level), 0)           AS Total_Units,
             COALESCE(SUM(p.Unit_Price * p.Stock_Level), 0) AS Inventory_Value,
             COALESCE(AVG(p.Unit_Price), 0)            AS Avg_Unit_Price
      FROM Category c
      LEFT JOIN Product p ON c.Category_Id = p.Category_Id
      GROUP BY c.Category_Id, c.Category_Name
      ORDER BY Inventory_Value DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Database error: " + e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────
app.listen(3000, () =>
  console.log("🚀 Server running on http://localhost:3000"),
);
