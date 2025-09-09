const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, format } = require("date-fns");

// helper to build bucket ranges
function buildBuckets(start, end, bucket) {
  const buckets = [];
  let cur;
  if (bucket === "month") cur = startOfMonth(start);
  else if (bucket === "week") cur = startOfWeek(start, { weekStartsOn: 1 });
  else cur = startOfDay(start);

  while (cur <= end) {
    let s = bucket === "month" ? startOfMonth(cur)
          : bucket === "week"  ? startOfWeek(cur, { weekStartsOn: 1 })
          : startOfDay(cur);
    let e = bucket === "month" ? endOfMonth(s)
          : bucket === "week"  ? endOfWeek(s, { weekStartsOn: 1 })
          : endOfDay(s);

    buckets.push({ start: s, end: e, total: 0 });
    cur = addDays(e, 1);
  }
  return buckets;
}

// Products endpoint
router.get("/products", async (req, res) => {
  try {
    const { startDate, endDate, bucket = "day" } = req.query;
    const end = endDate ? parseISO(endDate) : new Date();
    const start = startDate ? parseISO(startDate) : addDays(end, -29);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(date) as day, COALESCE(SUM(views),0) as total
      FROM ProductTrends
      WHERE date BETWEEN ? AND ?
      GROUP BY DATE(date)
      ORDER BY DATE(date);
    `, format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));

    const dayMap = {};
    rows.forEach(r => { dayMap[String(r.day)] = Number(r.total); });

    const buckets = buildBuckets(start, end, bucket);
    for (const b of buckets) {
      let cur = startOfDay(b.start);
      while (cur <= b.end && cur <= end) {
        const key = format(cur, "yyyy-MM-dd");
        if (dayMap[key]) b.total += dayMap[key];
        cur = addDays(cur, 1);
      }
    }

    res.json(buckets.map(b => ({
      startDate: format(b.start, "yyyy-MM-dd"),
      endDate: format(b.end, "yyyy-MM-dd"),
      count: b.total
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching product trends" });
  }
});

// Visitors endpoint
router.get("/visitors", async (req, res) => {
  try {
    const { startDate, endDate, bucket = "day" } = req.query;
    const end = endDate ? parseISO(endDate) : new Date();
    const start = startDate ? parseISO(startDate) : addDays(end, -29);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(date) as day, COUNT(*) as hits, COUNT(DISTINCT ipAddress) as uniqueVisitors
      FROM VisitorLogs
      WHERE date BETWEEN ? AND ?
      GROUP BY DATE(date)
      ORDER BY DATE(date);
    `, format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));

    const dayMap = {};
    rows.forEach(r => { dayMap[String(r.day)] = { hits: Number(r.hits), unique: Number(r.uniqueVisitors) }; });

    const buckets = buildBuckets(start, end, bucket);
    for (const b of buckets) {
      let cur = startOfDay(b.start);
      b.hits = 0;
      b.unique = 0;
      while (cur <= b.end && cur <= end) {
        const key = format(cur, "yyyy-MM-dd");
        if (dayMap[key]) {
          b.hits += dayMap[key].hits;
          b.unique += dayMap[key].unique;
        }
        cur = addDays(cur, 1);
      }
    }

    res.json(buckets.map(b => ({
      startDate: format(b.start, "yyyy-MM-dd"),
      endDate: format(b.end, "yyyy-MM-dd"),
      hits: b.hits,
      uniqueVisitors: b.unique
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching visitor logs" });
  }
});

module.exports = router;
