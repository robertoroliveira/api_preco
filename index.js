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
   📦 PRODUTO (SEM FILTRO)
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

        COALESCE(SUM(c.qtd_compra), 0) AS total_comprado,
        COALESCE(SUM(v.quantidade), 0) AS total_vendido,

        /* 🧾 ÚLTIMA COMPRA (PREÇO + FORNECEDOR) */
        c_last.preco_compra,
        c_last.nome_fornecedor,

        /* 📅 DATA ÚLTIMA COMPRA */
        COALESCE(
          TO_CHAR(MAX(c.data_compra::date), 'DD/MM/YYYY'),
          'SEM COMPRA'
        ) AS ultima_compra,

        /* 📦 ESTOQUE */
        COALESCE(SUM(c.qtd_compra), 0)
        - COALESCE(SUM(v.quantidade), 0) AS estoque_atual

      FROM produtos p

      LEFT JOIN compras c 
        ON c.produto_id = p.id

      LEFT JOIN vendas v 
        ON v.produto_id = p.id

      /* 🔥 ÚLTIMA COMPRA (LATERAL JOIN CORRETO) */
      LEFT JOIN LATERAL (
        SELECT 
          c2.preco_compra,
          c2.nome_fornecedor
        FROM compras c2
        WHERE c2.produto_id = p.id
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) c_last ON true

      WHERE p.codigo = $1
      GROUP BY 
        p.id, p.codigo, p.nome, p.preco,
        c_last.preco_compra,
        c_last.nome_fornecedor
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
   📅 PRODUTO COM FILTRO DATA
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