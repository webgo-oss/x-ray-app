const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '165428282@111',
  database: 'third_year_project'
});

connection.connect((err) => {
  if (err) console.log("Database connection error:", err);
  else console.log("Connected to the database, ID:", connection.threadId);
});

module.exports = connection;
