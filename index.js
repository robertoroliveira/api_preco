const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   📦 PRODUTO SEM DUPLICAÇÃO
========================= */
app.get("/produto/:codigo", async (req, res) => {
  const { codigo } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.codigo,
        p.nome,
        p.preco AS preco_venda,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        c_last.preco_compra,
        c_last.nome_fornecedor,
        c_last.data_compra,

        COALESCE(c.total_comprado, 0)
        - COALESCE(v.total_vendido, 0) AS estoque_atual

      FROM produtos p

      /* 🔥 COMPRA AGREGADA (SEM DUPLICAÇÃO) */
      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      /* 🔥 VENDA AGREGADA (SEM DUPLICAÇÃO) */
      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      /* 🔥 ÚLTIMA COMPRA (FORNECEDOR + PREÇO) */
      LEFT JOIN LATERAL (
        SELECT 
          preco_compra,
          nome_fornecedor,
          data_compra
        FROM compras c2
        WHERE c2.produto_id = p.id
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) c_last ON true

      WHERE p.codigo = $1
    `, [codigo]);

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

/* =========================
   📅 PRODUTO POR PERÍODO (SEGURO)
========================= */
app.get("/produto/:codigo/periodo", async (req, res) => {
  const { codigo } = req.params;
  const { inicio, fim } = req.query;

  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.codigo,
        p.nome,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        COALESCE(c.total_comprado, 0)
        - COALESCE(v.total_vendido, 0) AS estoque_periodo

      FROM produtos p

      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        WHERE data_compra::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        WHERE data_venda::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      WHERE p.codigo = $1
    `, [codigo, inicio, fim]);

    res.json(result.rows[0] || { error: "Produto não encontrado" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("API rodando");
});