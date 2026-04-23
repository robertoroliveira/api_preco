const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 CONEXÃO COM POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 📦 BUSCAR PRODUTO POR CÓDIGO
app.get("/produto/:codigo", async (req, res) => {
  const { codigo } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM produtos WHERE codigo = $1",
      [codigo]
    );

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// 🚀 START SERVER
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("API rodando");
});