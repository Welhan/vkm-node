// const mysql = require("mysql");
// const dotenv = require("dotenv");

// dotenv.config();

// const dbConfig = {
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   connectionLimit: 10,
//   waitForConnections: true,
//   queueLimit: 0,
//   port: process.env.DB_PORT ? process.env.DB_PORT : 3306,
// };
// const pool = mysql.createPool(dbConfig);

// function handleDisconnect() {
//   pool.getConnection((err, connection) => {
//     if (err) {
//       console.error("Error connecting to MySQL:", err);
//       setTimeout(handleDisconnect, 2000);
//       return;
//     }

//     if (connection) {
//       connection.release();
//     }
//   });

//   // Handle unexpected errors
//   pool.on("error", (err) => {
//     console.error("MySQL pool error:", err);
//     if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
//       handleDisconnect();
//     } else {
//       throw err;
//     }
//   });
// }
// handleDisconnect();

// module.exports = { db: pool };

const mysql = require("mysql");
const util = require("util");
const dotenv = require("dotenv");

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  port: process.env.DB_PORT ? process.env.DB_PORT : 3306,
};

const pool = mysql.createPool(dbConfig);

// Promisify pool.query agar bisa digunakan dengan async/await
pool.query = util.promisify(pool.query);

// Optional: reconnect logic
function handleDisconnect() {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to MySQL:", err);
      setTimeout(handleDisconnect, 2000);
      return;
    }

    if (connection) {
      connection.release();
    }
  });

  pool.on("error", (err) => {
    console.error("MySQL pool error:", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
      handleDisconnect();
    } else {
      throw err;
    }
  });
}

handleDisconnect();

module.exports = { db: pool };
