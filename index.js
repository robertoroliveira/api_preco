const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   🔌 CONEXÃO RAILWAY POSTGRES
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   📦 PRODUTO (SEM FILTRO - TOTAL GERAL)
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

        COALESCE(
          TO_CHAR(MAX(c.last_date), 'DD/MM/YYYY'),
          'SEM COMPRA'
        ) AS ultima_compra,

        COALESCE(c.total_comprado, 0)
        - COALESCE(v.total_vendido, 0) AS estoque_atual

      FROM produtos p

      /* 🔥 COMPRA JÁ AGREGADA */
      LEFT JOIN (
        SELECT 
          produto_id,
          SUM(qtd_compra) AS total_comprado,
          MAX(data_compra) AS last_date
        FROM compras
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      /* 🔥 VENDA JÁ AGREGADA */
      LEFT JOIN (
        SELECT 
          produto_id,
          SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      WHERE p.codigo = $1
      GROUP BY p.id, p.codigo, p.nome, p.preco, c.total_comprado, v.total_vendido, c.last_date
    `, [codigo]);

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro API produto:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   📅 PRODUTO COM FILTRO POR DATA
   (VERSÃO 100% SEGURA SEM DUPLICAÇÃO)
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

      /* 🔥 COMPRA FILTRADA E AGRUPADA */
      LEFT JOIN (
        SELECT 
          produto_id,
          SUM(qtd_compra) AS total_comprado
        FROM compras
        WHERE data_compra::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      /* 🔥 VENDA FILTRADA E AGRUPADA */
      LEFT JOIN (
        SELECT 
          produto_id,
          SUM(quantidade) AS total_vendido
        FROM vendas
        WHERE data_venda::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      WHERE p.codigo = $1
    `, [codigo, inicio, fim]);

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro API período:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`);
});