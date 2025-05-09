const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { db } = require("../configs/db");
const helpers = require("../helpers/helpers");
const constants = require("../configs/constants");
dotenv.config();

function formatDate(date, dateTime = true, delimiter = true) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (dateTime) {
    if (delimiter) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
  } else {
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  index: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 6, 8);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    let BracketLink = (
      await helpers.doQuery(
        db,
        "Select * FROM config WHERE Config = 'Bracket URL' AND WebsiteID = ?",
        [process.env.websiteID]
      )
    ).results;
    return res.render("withdraw/withdraw", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      bracketLink: BracketLink[0].Value ? true : false,
      menu,
      csrfToken: req.csrfToken(),
      open: 6,
      active: 8,
      constants,
    });
  },
  getData: async function (req, res) {
    let startDate = req.body.startDate
      ? (() => {
          return req.body.startDate.split("/").reverse().join("-");
        })()
      : "";

    let endDate = req.body.endDate
      ? (() => {
          return req.body.endDate.split("/").reverse().join("-");
        })()
      : "";
    let status = req.body.status || "";
    let player = req.body.player || "";

    let query = `SELECT A.*, B.Username AS Admin FROM withdraw_coin A LEFT JOIN admin B ON A.Last_User = B.ID WHERE 1=1`;
    let queryParams = [];
    if (startDate && endDate) {
      query += ` AND CDate BETWEEN ? AND ?`;
      queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (startDate) {
      query += ` AND CDate BETWEEN ? AND ?`;
      queryParams.push(`${startDate} 00:00:00`, `${startDate} 23:59:59`);
    } else if (endDate) {
      query += ` AND CDate BETWEEN ? AND ?`;
      queryParams.push(`${endDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (player) {
      query += ` AND Player = ?`;
      queryParams.push(player);
    }

    if (status) {
      query += ` AND Status = ?`;
      queryParams.push(status);
    }

    let result = (await helpers.doQuery(db, query, queryParams)).results;
    return res.json({
      data: result,
    });
  },
  getConfirmation: async function (req, res) {
    let id = req.body.id || "";
    let status = req.body.status || "";
    if (!id || !status) {
      return res.status(400).json({ error: "Invalid request" });
    }

    let data = (
      await helpers.doQuery(db, `SELECT * FROM withdraw_coin WHERE ID = ?`, [
        id,
      ])
    ).results;

    res.render(
      "withdraw/modals/confirmation",
      { layout: false, csrfToken: req.csrfToken(), status, data },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  processingWithdraw: async function (req, res) {
    let id = req.body.id || "";
    let status = req.body.status || "";
    let remarks = req.body.remarks || "";
    let error = {};

    if (!id) {
      error.global = "Proses gagal, silahkan coba lagi";
    }

    checkData = (
      await helpers.doQuery(db, `SELECT * FROM withdraw_coin WHERE ID = ?`, [
        id,
      ])
    ).results;

    if (checkData.length === 0) {
      error.global = "Data tidak ditemukan, silahkan coba lagi";
    }

    if (!status) {
      error.status = "Proses gagal, silahkan coba lagi";
    } else if (status !== "Approved" && status !== "Rejected") {
      error.status = "Status proses tidak sesuai, silahkan coba lagi";
    }

    if (status === "Rejected") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }

    let BracketLink = (
      await helpers.doQuery(
        db,
        "Select * FROM config WHERE Config = 'Bracket URL'"
      )
    ).results;

    if (BracketLink.length === 0) {
      error.global = "Bracket URL belum diatur";
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    if (status === "Approved") {
      let token =
        "W" +
        process.env.websiteID.toString() +
        "|" +
        checkData[0].Username +
        "|" +
        checkData[0].Amount +
        "|" +
        checkData[0].CodeTran +
        "|" +
        process.env.KodeLeaderboard +
        "|" +
        (await helpers.formatDate(new Date())) +
        "|" +
        req.session.Email;
      console.log(token);
      await axios
        .post(
          BracketLink[0].Value.toString() + "credit_bonus-api",
          {},
          {
            headers: {
              Authorization: `Bearer ${Buffer.from(token).toString("base64")}`,
            },
          }
        )
        .then(async (response) => {
          if (response) {
            if (response.data.status === true) {
              db.query(
                `UPDATE withdraw_coin SET Status = ?, Last_User = ?, CreditID = ?, Last_Date = ? WHERE ID = ?`,
                [
                  "Approved",
                  req.session.ID,
                  response.data.creditID,
                  formatDate(new Date()),
                  id,
                ],
                function (err) {
                  if (err) {
                    console.error(err);
                    error.global = "Proses Gagal. Silahkan Coba Kembali!";
                    return res.json({ error: error });
                  }
                  db.query(
                    `UPDATE history_coin SET Status = ? WHERE Code = ?`,
                    ["Selesai", checkData[0].CodeTran],
                    function (err) {
                      if (err) {
                        console.error(err);
                        error.global = "Proses Gagal. Silahkan Coba Kembali!";
                        return res.json({ error: error });
                      }
                      db.query(
                        `UPDATE transaction_history SET Status = ?, Last_Date = NOW() WHERE TransactionID = ?`,
                        ["Selesai", checkData[0].CodeTran],
                        function (err) {
                          if (err) {
                            error.global =
                              "Proses Gagal. Silahkan Coba Kembali!";
                            return res.json({ error: error });
                          }
                          db.query(
                            `INSERT INTO notification (Username, WebsiteID, NotificationHeader, NotificationDetail, ClaimableF, ClaimF, Date) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                            [
                              checkData[0].Username,
                              process.env.websiteID,
                              "Withdraw Coin Berhasil",
                              "",
                              0,
                              0,
                            ],
                            function (err) {
                              if (err) {
                                console.error(err);
                              }
                              return res.json({ status: true });
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            } else {
              error.global = response.data.message;
              return res.json({ error: error });
            }
          }
        })
        .catch((err) => {
          console.error(err);
          error.global = "Koneksi Ke Bracket Terputus";
          return res.json({ error: error });
        });
    } else if (status === "Rejected") {
      db.query(
        `UPDATE user SET Dompet_Koin = Dompet_Koin + ? WHERE Username = ?`,
        [checkData[0].Amount, checkData[0].Username],
        function (err) {
          if (err) {
            console.error(err);
            error.global = "Proses Gagal. Silahkan Coba Kembali!";
            return res.json({ error: error });
          }
          db.query(
            `UPDATE withdraw_coin SET Status = ?, Remarks = ?, Last_User = ?, Last_Date = ? WHERE ID = ?`,
            ["Rejected", remarks, req.session.ID, formatDate(new Date()), id],
            function (err) {
              if (err) {
                console.error(err);
                error.global = "Proses Gagal. Silahkan Coba Kembali!";
                return res.json({ error: error });
              }
              db.query(
                `UPDATE history_coin set Status = ? WHERE Code = ?`,
                ["Ditolak", checkData[0].CodeTran],
                function (err) {
                  if (err) {
                    console.error(err);
                    error.global = "Proses Gagal. Silahkan Coba Kembali!";
                    return res.json({ error: error });
                  }
                  db.query(
                    `UPDATE transaction_history SET Status = ?, Last_Date = NOW() WHERE TransactionID = ?`,
                    ["Ditolak", checkData[0].CodeTran],
                    function (err) {
                      if (err) {
                        console.error(err);
                        error.global = "Proses Gagal. Silahkan Coba Kembali!";
                        return res.json({ error: error });
                      }
                      db.query(
                        `INSERT INTO notification (Username, WebsiteID, NotificationHeader,NotificationDetail,ClaimableF,ClaimF,Date) VALUE (?, ?, ?, ?, ?, ?, NOW())`,
                        [
                          checkData[0].Username,
                          process.env.websiteID,
                          "Withdraw Coin Ditolak",
                          "",
                          0,
                          0,
                        ],
                        function (err) {
                          if (err) {
                            console.error(err);
                            error.global =
                              "Proses Gagal. Silahkan Coba Kembali!";
                            return res.json({ error: error });
                          }
                          return res.json({ status: true });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  },
  getCoin: async function (req, res) {
    let BracketLink = (
      await helpers.doQuery(
        db,
        "Select * FROM config WHERE Config = 'Bracket URL'"
      )
    ).results;
    let result = {};

    let outStanding = (
      await helpers.doQuery(
        db,
        `SELECT SUM(Dompet_Koin) As Total From user WHERE WebsiteID = ?`,
        [process.env.websiteID]
      )
    ).results;

    result.outstanding = outStanding[0].Total;

    let request = (
      await helpers.doQuery(
        db,
        `SELECT SUM(Amount) AS Total FROM withdraw_coin WHERE WebsiteID = ? AND Status = 'Pending'`,
        [process.env.websiteID]
      )
    ).results;

    result.request = request[0].Total;

    if (BracketLink[0].Value !== "" && BracketLink[0].Value !== null) {
      let token =
        "W" +
        process.env.websiteID.toString() +
        "|" +
        req.session.Email +
        "|" +
        (await helpers.formatDate(new Date()));

      await axios
        .post(
          BracketLink[0].Value.toString() + "coin_web-api",
          {},
          {
            headers: {
              Authorization: `Bearer ${Buffer.from(token).toString("base64")}`,
            },
          }
        )
        .then(async (response) => {
          if (response.data.status == true) {
            coin = response.data.coin;
          }

          result.coin = response.data.coin;
        })
        .catch((error) => {
          console.log(error);
        });
    }
    return res.json({ result });
  },
};
