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
   📦 PRODUTO (GLOBAL COMPLETO)
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

        (COALESCE(c.total_comprado, 0) - COALESCE(v.total_vendido, 0)) AS estoque_atual,

        ult.nome_fornecedor,
        ult.preco_compra,
        ult.data_compra AS ultima_compra

      FROM produtos p

      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      LEFT JOIN LATERAL (
        SELECT 
          nome_fornecedor,
          preco_compra,
          TO_CHAR(data_compra::date, 'DD/MM/YYYY') AS data_compra
        FROM compras c2
        WHERE c2.produto_id = p.id
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) ult ON true

      WHERE p.codigo = $1
    `, [codigo]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   📅 PRODUTO (PERÍODO)
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
        p.preco AS preco_venda,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        (COALESCE(c.total_comprado, 0) - COALESCE(v.total_vendido, 0)) AS estoque_periodo,

        ult.nome_fornecedor,
        ult.preco_compra,
        ult.data_compra

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

      LEFT JOIN LATERAL (
        SELECT 
          nome_fornecedor,
          preco_compra,
          TO_CHAR(data_compra::date, 'DD/MM/YYYY') AS data_compra
        FROM compras c2
        WHERE c2.produto_id = p.id
          AND c2.data_compra::date BETWEEN $2 AND $3
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) ult ON true

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