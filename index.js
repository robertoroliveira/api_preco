const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 CONEXÃO COM POSTGRESQL (Railway)
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
    const result = await pool.query(`
      SELECT 
        p.id,
        p.codigo,
        p.nome,
        p.preco AS preco_venda,

        c.preco_compra,
        TO_CHAR(c.data_compra::date, 'DD/MM/YYYY') AS data_compra,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        COALESCE(c.total_comprado, 0) - COALESCE(v.total_vendido, 0) AS estoque_atual

      FROM produtos p

      LEFT JOIN (
        SELECT produto_id, preco_compra, data_compra, SUM(qtd_compra) AS total_comprado
        FROM compras
        GROUP BY produto_id, preco_compra, data_compra
      ) c ON c.produto_id = p.id

      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      WHERE p.codigo = $1
    `, [codigo]);

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro na API:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`);
});