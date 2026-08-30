require('dotenv').config();
const mysql = require('mysql');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

connection.connect((err) => {
  if (err) console.log("Database connection error:", err);
  else console.log("Connected to the database, ID:", connection.threadId);
});

module.exports = connection;
